/**
 * useDriivaGeolocation
 * ====================
 * Production-ready geolocation hook — Driiva's single source of truth for
 * phone-based GPS telemetry.
 *
 * SCOPE: capture + minimal sensor validation ONLY.
 * Scoring, fraud models, and refund logic all live in Cloud Functions /
 * ML services. This hook only emits a clean, read-only stream of points.
 *
 * Architecture:
 *   - navigator.geolocation.watchPosition is the primary driver (battery-
 *     efficient: the OS coalesces hardware reads vs. a polling setInterval).
 *   - A time-based throttle enforces the desired pollIntervalMs gap between
 *     accepted points regardless of how often the OS fires watchPosition.
 *   - When stationary for > maxStationarySeconds, we switch to a light
 *     12-second fallback poll so we detect the instant the user starts moving
 *     again — without burning GPS at full rate while parked or in traffic.
 *   - All accepted points flow into an in-memory buffer; the caller is
 *     responsible for batch-uploading every ~10 s and calling clearBuffer().
 *
 * Risk mitigations (mapped to Driiva's technical design docs):
 *   - GPS inaccuracy (urban canyons): accuracy threshold + teleportation filter.
 *   - Users gaming the system: no mutable output; points are read-only structs
 *     from the device API; fraud logic runs server-side (Stop-Go, IsolationForest).
 *   - Battery drain: watchPosition over setInterval; light-poll in stationary
 *     mode; configurable highAccuracy flag; proper cleanup on unmount/stop.
 *   - Over-collection: tracking only runs between explicit startTracking /
 *     stopTracking calls — no background-app collection.
 *   - Data regime drift: captureVersion tag on every point lets ML pipelines
 *     partition training data when collection logic changes.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { haversineMeters } from '@shared/tripProcessor';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Tag embedded in every point so downstream models can partition data regimes. */
export const GEO_CAPTURE_VERSION = 'v1-continuous-telemetry';

// Plausibility thresholds
/** ~200 mph — physically impossible on any public road. */
const MAX_VALID_SPEED_MS = 89.4;
/**
 * Derived speed (Haversine) above which we treat the GPS reading as a jump
 * (urban canyon tunnel exit, cell-tower handoff artefact, etc.).
 */
const MAX_TELEPORT_SPEED_MS = 100; // m/s

/** Earth mean radius for Haversine. */

/**
 * When in stationary mode, fire a lightweight getCurrentPosition this often.
 * Keeps the trip "alive" so we catch the first motion event quickly, without
 * running high-accuracy GPS at full rate while parked or in a drive-through.
 */
const STATIONARY_POLL_MS = 12_000;

// ============================================================================
// PUBLIC TYPES
// ============================================================================

/**
 * A single validated GPS point emitted by the hook.
 * Immutable — consumers must not mutate points after receiving them.
 */
export type DriivaGeoPoint = {
  latitude: number;
  longitude: number;
  /** m/s derived from device API or Haversine fallback; null only if first point and device omits speed. */
  speed: number | null;
  /** Degrees 0-360; null when device cannot determine heading. */
  heading: number | null;
  /** GPS accuracy radius in metres (smaller = better). */
  accuracy: number | null;
  /** Unix epoch ms — GPS timestamp, not wall-clock. */
  timestamp: number;
  /** Data-regime tag for ML pipeline versioning. */
  captureVersion: string;
};

export type GeoStatus =
  | 'idle'             // Not yet started, or explicitly stopped.
  | 'permission-denied' // User rejected the permission prompt.
  | 'acquiring'        // watchPosition registered; waiting for first fix.
  | 'tracking'         // Actively receiving and accepting GPS fixes.
  | 'error';           // Non-permission geolocation error (unavailable, timeout).

export type UseDriivaGeolocationOptions = {
  /**
   * Minimum time gap between accepted points.
   * Implements the ~1 Hz target: watchPosition fires when the OS has data;
   * we throttle to this interval. Default 1000 ms.
   * Raise to 2000-3000 ms for an "eco mode" A/B test.
   */
  pollIntervalMs?: number;
  /**
   * Discard readings whose accuracy radius exceeds this value.
   * 25 m balances urban canyon filtering with signal availability.
   * Raise to ~50 m in low-signal rural areas if needed.
   */
  minAccuracyMeters?: number;
  /**
   * Consecutive seconds of near-zero speed (< 1 m/s) before entering
   * stationary mode. 30 s tolerates long red lights without triggering
   * prematurely on slow urban traffic.
   */
  maxStationarySeconds?: number;
  /**
   * Request GNSS-quality accuracy vs WiFi/cell fallback.
   * True by default; set false for the eco-mode experiment.
   */
  highAccuracy?: boolean;
  /** Emit diagnostic console.log output and populate debugStats. */
  debug?: boolean;
};

export type UseDriivaGeolocationResult = {
  status: GeoStatus;
  /** Most recently accepted point. Null until first fix arrives. */
  latestPoint: DriivaGeoPoint | null;
  /**
   * Points accumulated since the last clearBuffer() call.
   * The caller should batch-upload this every ~10 s to Firestore's
   * tripPoints/{tripId} collection, then call clearBuffer().
   */
  buffer: DriivaGeoPoint[];
  startTracking: () => void;
  stopTracking: () => void;
  /** Empty the buffer after a successful Firestore write. */
  clearBuffer: () => void;
  error: GeolocationPositionError | Error | null;
  /**
   * Only populated when debug: true.
   * Useful for QA to understand filtering effectiveness.
   */
  debugStats: { accepted: number; discarded: number } | null;
};

// ============================================================================
// UTILITIES
// ============================================================================

// Haversine — canonical source: shared/tripProcessor.ts (imported at top of file)

// ============================================================================
// HOOK
// ============================================================================

export function useDriivaGeolocation(
  options: UseDriivaGeolocationOptions = {},
): UseDriivaGeolocationResult {
  const {
    pollIntervalMs = 1_000,
    minAccuracyMeters = 25,
    maxStationarySeconds = 30,
    highAccuracy = true,
    debug = false,
  } = options;

  // --------------------------------------------------------------------------
  // Refs: mutable tracking state that must not trigger re-renders
  // --------------------------------------------------------------------------

  /** watchPosition handle — null when not tracking. */
  const watchIdRef = useRef<number | null>(null);
  /** Interval handle for stationary light-poll mode. */
  const lightPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * processPosition is stored in a ref so startLightPoll can reference the
   * latest version without creating a circular useCallback dependency.
   */
  const processPositionRef = useRef<((pos: GeolocationPosition) => void) | null>(null);

  /** In-memory point buffer. Ref so appending doesn't cause render on every point. */
  const bufferRef = useRef<DriivaGeoPoint[]>([]);
  /** Last accepted point — used for Haversine + teleportation detection. */
  const lastAcceptedRef = useRef<DriivaGeoPoint | null>(null);
  /**
   * Wall-clock time of the last accepted point.
   * Separate from GPS timestamp to implement the pollIntervalMs throttle
   * independently of any GPS clock drift.
   */
  const lastAcceptedWallTimeRef = useRef<number>(0);

  /** Wall-clock time near-zero speed was first detected; null = currently moving. */
  const stationaryStartRef = useRef<number | null>(null);
  /** Whether we're currently in stationary (light-poll) mode. */
  const isStationaryRef = useRef<boolean>(false);

  // Debug counters
  const acceptedRef = useRef(0);
  const discardedRef = useRef(0);

  // --------------------------------------------------------------------------
  // React state — only what drives re-renders
  // --------------------------------------------------------------------------

  const [status, setStatus] = useState<GeoStatus>('idle');
  const [latestPoint, setLatestPoint] = useState<DriivaGeoPoint | null>(null);
  /** Snapshot of bufferRef exposed to React consumers. Updated after each accepted point. */
  const [bufferSnapshot, setBufferSnapshot] = useState<DriivaGeoPoint[]>([]);
  const [error, setError] = useState<GeolocationPositionError | Error | null>(null);
  const [debugStats, setDebugStats] = useState<{ accepted: number; discarded: number } | null>(
    null,
  );

  // --------------------------------------------------------------------------
  // Light-poll helpers (stable — no reactive deps, safe to call from processPosition)
  // --------------------------------------------------------------------------

  const stopLightPoll = useCallback(() => {
    if (lightPollIntervalRef.current !== null) {
      clearInterval(lightPollIntervalRef.current);
      lightPollIntervalRef.current = null;
    }
  }, []);

  /**
   * Begin a low-frequency fallback poll while stationary.
   * Uses getCurrentPosition (not watchPosition) so we're not stacking watchers.
   * Low-accuracy mode: battery mitigation — we only need to detect motion onset,
   * not a precise GPS fix.
   *
   * Risk: battery drain from continuous high-accuracy GPS while parked.
   * Mitigation: switch to 12-second, low-accuracy polling in stationary mode.
   */
  const startLightPoll = useCallback(() => {
    if (lightPollIntervalRef.current !== null) return; // already running

    if (debug) console.log('[Driiva GPS] starting stationary light-poll (12 s interval)');

    lightPollIntervalRef.current = setInterval(() => {
      if (navigator.geolocation && processPositionRef.current) {
        navigator.geolocation.getCurrentPosition(
          processPositionRef.current,
          () => {
            // Swallow errors in light-poll: watchPosition is still the primary
            // watcher and will surface real errors via its own error handler.
          },
          {
            enableHighAccuracy: false, // battery mitigation: low-accuracy OK for motion detection
            timeout: 8_000,
            maximumAge: 10_000,
          },
        );
      }
    }, STATIONARY_POLL_MS);
  }, [debug]);

  // --------------------------------------------------------------------------
  // Core: validate and accept a raw GeolocationPosition
  // --------------------------------------------------------------------------

  const processPosition = useCallback(
    (position: GeolocationPosition) => {
      const { coords, timestamp: gpsTimestamp } = position;
      const wallNow = Date.now();

      // -- 1. Time throttle --------------------------------------------------
      // Enforce pollIntervalMs gap regardless of how often watchPosition fires.
      // This is the mechanism behind the configurable "polling rate" since
      // watchPosition itself doesn't accept an interval parameter.
      if (wallNow - lastAcceptedWallTimeRef.current < pollIntervalMs) {
        return;
      }

      // -- 2. Accuracy filter ------------------------------------------------
      // Risk: GPS inaccuracy in urban canyons → noisy distance readings.
      // Mitigation: hard drop above minAccuracyMeters threshold.
      if (coords.accuracy > minAccuracyMeters) {
        discardedRef.current++;
        if (debug) {
          console.log(
            `[Driiva GPS] discard — accuracy ${coords.accuracy.toFixed(0)} m > limit ${minAccuracyMeters} m`,
          );
          setDebugStats({ accepted: acceptedRef.current, discarded: discardedRef.current });
        }
        return;
      }

      // -- 3. Raw speed plausibility check -----------------------------------
      // Risk: sensor spike / satellite glitch returning impossible speed.
      // Mitigation: reject anything above ~200 mph.
      const rawSpeed =
        coords.speed !== null && coords.speed >= 0 ? coords.speed : null;
      if (rawSpeed !== null && rawSpeed > MAX_VALID_SPEED_MS) {
        discardedRef.current++;
        if (debug) {
          console.log(
            `[Driiva GPS] discard — impossible raw speed ${rawSpeed.toFixed(1)} m/s`,
          );
          setDebugStats({ accepted: acceptedRef.current, discarded: discardedRef.current });
        }
        return;
      }

      // -- 4. Teleportation / GPS-jump filter --------------------------------
      // Risk: urban canyon tunnel exits, cell-tower handoffs, satellite
      //       acquisition gaps → sudden large position jump between two points.
      // Mitigation: compute derived speed via Haversine; reject if it implies
      //   a teleport. Backend anomaly flags (hasGpsJumps) catch anything we miss.
      let derivedSpeed: number | null = rawSpeed;
      const prev = lastAcceptedRef.current;

      if (prev !== null) {
        const dtSec = (gpsTimestamp - prev.timestamp) / 1_000;
        if (dtSec > 0) {
          const distM = haversineMeters(
            prev.latitude,
            prev.longitude,
            coords.latitude,
            coords.longitude,
          );
          const derivedMs = distM / dtSec;

          if (derivedMs > MAX_TELEPORT_SPEED_MS) {
            discardedRef.current++;
            if (debug) {
              console.log(
                `[Driiva GPS] discard — teleport jump: derived ${derivedMs.toFixed(1)} m/s`,
              );
              setDebugStats({ accepted: acceptedRef.current, discarded: discardedRef.current });
            }
            return;
          }

          // Prefer device-reported speed; fall back to Haversine.
          // iOS PWA routinely returns null for coords.speed during navigation.
          if (derivedSpeed === null) {
            derivedSpeed = derivedMs;
          }
        }
      }

      // -- 5. Stationary detection -------------------------------------------
      // Risk: inflating distance while dwelling (parking, traffic light, drive-through).
      // Mitigation (client-side): drop to light-poll after maxStationarySeconds
      //   of near-zero speed, saving battery and bandwidth.
      // Mitigation (server-side): Stop-Go Classifier zeroes out dwell distance
      //   and backend anomaly flags catch anything slipping through.
      const speedMs = derivedSpeed ?? 0;

      if (speedMs < 1.0) {
        // Near-zero: start / extend the stationary timer.
        if (stationaryStartRef.current === null) {
          stationaryStartRef.current = wallNow;
        }
        const stationaryElapsedSec = (wallNow - stationaryStartRef.current) / 1_000;

        if (stationaryElapsedSec >= maxStationarySeconds && !isStationaryRef.current) {
          isStationaryRef.current = true;
          if (debug) {
            console.log(
              `[Driiva GPS] stationary mode ON after ${stationaryElapsedSec.toFixed(0)} s at near-zero speed`,
            );
          }
          startLightPoll();
        }
      } else {
        // Moving — leave stationary mode if active.
        if (isStationaryRef.current) {
          isStationaryRef.current = false;
          stationaryStartRef.current = null;
          if (debug) console.log('[Driiva GPS] stationary mode OFF — motion detected');
          stopLightPoll();
        } else {
          stationaryStartRef.current = null;
        }
      }

      // -- 6. Build and enqueue the accepted point ---------------------------
      // Risk: users gaming the system by editing client-side data.
      // Mitigation: output is a read-only plain object derived entirely from
      //   the device Geolocation API. Fraud logic is server-side only.
      const point: DriivaGeoPoint = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        speed: derivedSpeed,
        heading: coords.heading,
        accuracy: coords.accuracy,
        timestamp: gpsTimestamp,
        captureVersion: GEO_CAPTURE_VERSION,
      };

      bufferRef.current = [...bufferRef.current, point];
      lastAcceptedRef.current = point;
      lastAcceptedWallTimeRef.current = wallNow;
      acceptedRef.current++;

      setLatestPoint(point);
      setBufferSnapshot(bufferRef.current);

      if (debug) {
        console.log(
          `[Driiva GPS] accepted — spd: ${derivedSpeed?.toFixed(1) ?? 'null'} m/s, ` +
            `acc: ${coords.accuracy.toFixed(0)} m, stationary: ${isStationaryRef.current}`,
        );
        setDebugStats({ accepted: acceptedRef.current, discarded: discardedRef.current });
      }
    },
    [pollIntervalMs, minAccuracyMeters, maxStationarySeconds, debug, startLightPoll, stopLightPoll],
  );

  // Keep processPositionRef in sync so startLightPoll always calls the latest version.
  useEffect(() => {
    processPositionRef.current = processPosition;
  }, [processPosition]);

  // --------------------------------------------------------------------------
  // Error handler
  // --------------------------------------------------------------------------

  const handleError = useCallback(
    (err: GeolocationPositionError) => {
      if (debug) console.warn('[Driiva GPS] error:', err.message);
      setError(err);
      // Distinguish permission denial from transient errors so the UI can
      // prompt the user to enable location access vs. show a generic retry.
      setStatus(err.code === err.PERMISSION_DENIED ? 'permission-denied' : 'error');
    },
    [debug],
  );

  // --------------------------------------------------------------------------
  // Public: startTracking
  // --------------------------------------------------------------------------

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      // Safe fallback for older browsers / http-only origins.
      const err = new Error('Geolocation is not supported by this browser');
      setError(err);
      setStatus('error');
      return;
    }

    // Prevent duplicate watchers.
    // Risk: stacked watchers drain battery and produce duplicate points.
    // Mitigation: always clear any existing watcher before registering a new one.
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopLightPoll();

    // Reset all mutable state for a fresh trip.
    bufferRef.current = [];
    lastAcceptedRef.current = null;
    lastAcceptedWallTimeRef.current = 0;
    stationaryStartRef.current = null;
    isStationaryRef.current = false;
    acceptedRef.current = 0;
    discardedRef.current = 0;

    setStatus('acquiring');
    setError(null);
    setLatestPoint(null);
    setBufferSnapshot([]);
    if (debug) setDebugStats({ accepted: 0, discarded: 0 });

    // Register the primary watcher.
    // watchPosition is preferred over setInterval + getCurrentPosition because
    // the OS can batch hardware sensor reads internally, reducing wake-ups.
    // maximumAge=0: always fresh — stale cached positions corrupt scoring.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        // Transition from 'acquiring' to 'tracking' on the first successful fix.
        setStatus('tracking');
        processPosition(pos);
      },
      handleError,
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: 0,
        timeout: 15_000,
      },
    );

    if (debug) {
      console.log(
        `[Driiva GPS] tracking started — highAccuracy:${highAccuracy}, ` +
          `pollIntervalMs:${pollIntervalMs}, minAccuracyMeters:${minAccuracyMeters}`,
      );
    }
  }, [processPosition, handleError, highAccuracy, pollIntervalMs, minAccuracyMeters, debug, stopLightPoll]);

  // --------------------------------------------------------------------------
  // Public: stopTracking
  // --------------------------------------------------------------------------

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopLightPoll();
    stationaryStartRef.current = null;
    isStationaryRef.current = false;
    setStatus('idle');

    if (debug) {
      console.log(
        `[Driiva GPS] tracking stopped — accepted: ${acceptedRef.current}, ` +
          `discarded: ${discardedRef.current}`,
      );
    }
  }, [stopLightPoll, debug]);

  // --------------------------------------------------------------------------
  // Public: clearBuffer
  // Called by the consumer after a successful Firestore batch write.
  // --------------------------------------------------------------------------

  const clearBuffer = useCallback(() => {
    bufferRef.current = [];
    setBufferSnapshot([]);
  }, []);

  // --------------------------------------------------------------------------
  // Cleanup on unmount
  // Risk: memory leaks from dangling watchers if component unmounts mid-trip.
  // Mitigation: always teardown watchPosition and intervals in effect cleanup.
  // --------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (lightPollIntervalRef.current !== null) {
        clearInterval(lightPollIntervalRef.current);
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // Return
  // --------------------------------------------------------------------------

  return {
    status,
    latestPoint,
    buffer: bufferSnapshot,
    startTracking,
    stopTracking,
    clearBuffer,
    error,
    debugStats,
  };
}
