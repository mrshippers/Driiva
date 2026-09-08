/**
 * TRIP METRICS
 * ============
 * Ported verbatim from `functions/src/utils/helpers.ts:224-489` (the
 * `computeTripMetrics` algorithm and its private helpers) plus
 * `shared/tripProcessor.ts:23` (`haversineMeters`, the distance dependency).
 * Byte-faithful to current behaviour: do NOT "fix" or refactor any logic
 * here. See the M0 Task 2 report for characterisation evidence and any
 * bugs spotted but intentionally left unchanged.
 *
 * ONE deliberate exception to that freeze: phone-usage wiring (M2-DEC-1
 * Option A, docs/rebuild/m2-dec-1-phone-usage.md). `computeTripMetrics` took
 * a second, optional `clientReportedPhonePickupCount` parameter so the 10%
 * phone-usage weight (SCORE_WEIGHTS.phoneUsage below) can score something
 * other than a permanent, undisclosed 100. See `sanitizePhonePickupCount`
 * for what "wired" means here: a client-reported number the server
 * sanity-checks and rate-caps, not an independently verified one - there is
 * no server-side accelerometer stream to check it against. Everything else
 * in this file is still the frozen, byte-faithful port.
 *
 * `TripEvents` / `TripMetrics` mirror `functions/src/types.ts` `TripEvents`
 * / `ComputedTripMetrics` field-for-field. @driiva/contracts does not yet
 * define these shapes, so they are declared locally per the brief.
 *
 * THIS FILE IS THE AUTHORED SOURCE. `functions/src/scoring/tripMetrics.ts`
 * is a build-time copy (see functions/package.json `prebuild`, which `cp`s
 * this file over it) - edit here, then sync that copy by hand if you are not
 * running the functions build.
 */
import type { TripPoint, ScoreBreakdown } from '@driiva/contracts';

/** Mirrors `functions/src/types.ts` `TripEvents`. */
export interface TripEvents {
  hardBrakingCount: number;
  hardAccelerationCount: number;
  speedingSeconds: number;
  sharpTurnCount: number;
  phonePickupCount: number;
}

/** Mirrors `functions/src/types.ts` `ComputedTripMetrics`. */
export interface TripMetrics {
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedMps: number; // meters per second
  maxSpeedMps: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  events: TripEvents;
}

/**
 * Composite score weights. Single source of truth for both the algorithm
 * (computeDrivingScore, below) and any UI that shows the weighting to a user
 * (trip-detail's score breakdown). Values are byte-identical to the previous
 * inline literals (25/25/20/20/10) - extracting them changes nothing about
 * the computed score, it just makes algorithm and display impossible to drift
 * apart. These must sum to 1.0.
 */
export const SCORE_WEIGHTS = {
  speed: 0.25,
  braking: 0.25,
  acceleration: 0.2,
  cornering: 0.2,
  phoneUsage: 0.1,
} as const;

/**
 * Haversine distance between two WGS84 points, in meters.
 * Ported verbatim from `shared/tripProcessor.ts`.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  // Near-antipodal pairs can round `a` fractionally above 1, making
  // Math.sqrt(1 - a) take the root of a negative number and return NaN. Clamp
  // to [0, 1] before the sqrt. Unreachable by sequential trip points (metres
  // apart), but cheap and correct.
  const aClamped = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped));

  return R * c;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Ported verbatim from `functions/src/utils/helpers.ts:109`.
 */
const calculateDistance = haversineMeters;

/**
 * Compute trip metrics from raw GPS points.
 * This is the core algorithm that processes GPS data to derive metrics and
 * scores. Frozen signature for everything except `clientReportedPhonePickupCount`
 * (M0 Task 2 brief; M2-DEC-1 Option A added the second parameter - see the
 * file header).
 *
 * `clientReportedPhonePickupCount` is the client's own count of phone
 * pickups during the trip. Both clients now count it from an on-device
 * accelerometer heuristic (mobile/lib/phonePickup.ts, client/src/lib/
 * phonePickup.ts); the web surface additionally counts a tab switch, because
 * browsers stop delivering devicemotion to a page that is not visible, and
 * debounces the two together so one act is one pickup. See the call sites in
 * functions/src/triggers/trips.ts and each client for what "pickup" means on
 * that platform. It is sanitised via `sanitizePhonePickupCount` before it
 * can influence `events.phonePickupCount` or the score, because it is client
 * input the server has no independent way to verify.
 */
export function computeTripMetrics(
  points: TripPoint[],
  clientReportedPhonePickupCount?: number
): TripMetrics {
  if (points.length < 2) {
    return getDefaultMetrics();
  }

  // Sort points by timestamp
  const sortedPoints = [...points].sort((a, b) => a.t - b.t);

  // 1. Compute distance using Haversine between sequential points
  let totalDistanceMeters = 0;
  for (let i = 1; i < sortedPoints.length; i++) {
    const prev = sortedPoints[i - 1];
    const curr = sortedPoints[i];
    totalDistanceMeters += calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
  }

  // 2. Compute duration from first to last point
  const firstPoint = sortedPoints[0];
  const lastPoint = sortedPoints[sortedPoints.length - 1];
  const durationMs = lastPoint.t - firstPoint.t;
  const durationSeconds = Math.max(1, Math.round(durationMs / 1000)); // At least 1 second

  // 3. Compute speed statistics
  const { avgSpeedMps, maxSpeedMps, speedVariance } = computeSpeedStats(sortedPoints);

  // 4. Detect driving events from the GPS trace itself (braking, acceleration,
  // speeding, cornering). Phone pickups cannot be detected from GPS alone, so
  // detectDrivingEvents still always initialises phonePickupCount to 0 here -
  // it is overlaid with the sanitised client-reported count immediately
  // below, once durationSeconds (needed for the rate cap) is known.
  const events = detectDrivingEvents(sortedPoints);
  events.phonePickupCount = sanitizePhonePickupCount(
    clientReportedPhonePickupCount,
    durationSeconds
  );

  // 5. Compute driving score
  const { score, scoreBreakdown } = computeDrivingScore(
    sortedPoints,
    events,
    speedVariance,
    avgSpeedMps,
    totalDistanceMeters,
    durationSeconds
  );

  return {
    distanceMeters: Math.round(totalDistanceMeters),
    durationSeconds,
    avgSpeedMps,
    maxSpeedMps,
    score,
    scoreBreakdown,
    events,
  };
}

/**
 * Default metrics for trips with insufficient data
 */
function getDefaultMetrics(): TripMetrics {
  return {
    distanceMeters: 0,
    durationSeconds: 0,
    avgSpeedMps: 0,
    maxSpeedMps: 0,
    score: 70, // Default neutral score
    scoreBreakdown: {
      speedScore: 70,
      brakingScore: 70,
      accelerationScore: 70,
      corneringScore: 70,
      phoneUsageScore: 100,
    },
    events: {
      hardBrakingCount: 0,
      hardAccelerationCount: 0,
      speedingSeconds: 0,
      sharpTurnCount: 0,
      phonePickupCount: 0,
    },
  };
}

/**
 * Compute speed statistics from points
 */
function computeSpeedStats(points: TripPoint[]): {
  avgSpeedMps: number;
  maxSpeedMps: number;
  speedVariance: number;
} {
  if (points.length === 0) {
    return { avgSpeedMps: 0, maxSpeedMps: 0, speedVariance: 0 };
  }

  // Convert spd from integer (m/s * 100) to m/s
  const speeds = points
    .map(p => p.spd / 100) // Convert to actual m/s
    .filter(s => s >= 0 && s < 100); // Filter unreasonable speeds (< 360 km/h)

  if (speeds.length === 0) {
    return { avgSpeedMps: 0, maxSpeedMps: 0, speedVariance: 0 };
  }

  const avgSpeedMps = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
  const maxSpeedMps = Math.max(...speeds);

  // Calculate variance
  const variance = speeds.reduce((sum, s) => sum + Math.pow(s - avgSpeedMps, 2), 0) / speeds.length;
  const speedVariance = Math.sqrt(variance);

  return {
    avgSpeedMps: Math.round(avgSpeedMps * 100) / 100,
    maxSpeedMps: Math.round(maxSpeedMps * 100) / 100,
    speedVariance: Math.round(speedVariance * 100) / 100,
  };
}

// Event thresholds. These used to be locals inside detectDrivingEvents, which
// meant the only way for a screen to draw an event marker was to retype them.
// This repo has already shipped transposed SCORE_WEIGHTS to the marketing site
// once by retyping a constant, so the numbers stay here and the RESULT is what
// gets exported, via locateDrivingEvents below.
const HARD_BRAKING_THRESHOLD = -3.5; // m/s² (deceleration)
const HARD_ACCEL_THRESHOLD = 3.0;    // m/s² (acceleration)
const SHARP_TURN_THRESHOLD = 30;     // degrees per second
const SPEED_LIMIT_MPS = 31.3;        // ~70 mph in m/s

/** The four event types that can be derived from the GPS trace alone. */
export type DrivingEventType = 'braking' | 'acceleration' | 'cornering' | 'speeding';

/**
 * One detected event, with the point it happened at.
 *
 * Phone pickups are deliberately absent. They are a client-reported number
 * with no position attached, not something derived from the trace, so there is
 * no honest place to draw one.
 */
export interface LocatedDrivingEvent {
  type: DrivingEventType;
  /**
   * Index of the CURRENT point of the interval, in the array passed in.
   *
   * This function does not sort. Sorting internally would return indices into
   * an array the caller does not hold, which is a trap. computeTripMetrics
   * sorts by `t` before scoring, so pass points sorted by `t` if you want the
   * indices to line up with the server's scoring pass.
   */
  index: number;
  /** That point's `t`. */
  t: number;
  /**
   * Seconds attributed to this event. Only 'speeding' carries one, because the
   * score counts speeding as a DURATION rather than as occurrences. The other
   * three are instants and leave this undefined.
   */
  seconds?: number;
}

/**
 * Every driving event in a trace, with where it happened.
 *
 * detectDrivingEvents tallies exactly this list, so a marker drawn from here
 * and a count read off the trip document cannot disagree. That identity is
 * asserted in tripMetrics.eventLocator.test.ts rather than assumed.
 */
export function locateDrivingEvents(points: TripPoint[]): LocatedDrivingEvent[] {
  const located: LocatedDrivingEvent[] = [];

  if (points.length < 2) {
    return located;
  }

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    // Time delta in seconds
    const dt = (curr.t - prev.t) / 1000;
    if (dt <= 0 || dt > 10) continue; // Skip invalid intervals

    // Speed values (convert from integer format)
    const prevSpeed = prev.spd / 100;
    const currSpeed = curr.spd / 100;

    // Calculate acceleration (m/s²)
    const acceleration = (currSpeed - prevSpeed) / dt;

    // Hard braking detection
    if (acceleration < HARD_BRAKING_THRESHOLD) {
      located.push({ type: 'braking', index: i, t: curr.t });
    }

    // Hard acceleration detection
    if (acceleration > HARD_ACCEL_THRESHOLD) {
      located.push({ type: 'acceleration', index: i, t: curr.t });
    }

    // Speeding detection
    if (currSpeed > SPEED_LIMIT_MPS) {
      located.push({ type: 'speeding', index: i, t: curr.t, seconds: Math.round(dt) });
    }

    // Sharp turn detection (heading change rate)
    const headingDelta = Math.abs(normalizeHeadingDelta(curr.hdg - prev.hdg));
    const headingRate = headingDelta / dt;
    if (headingRate > SHARP_TURN_THRESHOLD && currSpeed > 5) {
      located.push({ type: 'cornering', index: i, t: curr.t });
    }
  }

  return located;
}

/**
 * Detect driving events from GPS points.
 *
 * A tally over locateDrivingEvents, so there is one pass and one definition of
 * what an event is. phonePickupCount is always 0 here; computeTripMetrics
 * overlays the sanitised client-reported count once the duration is known.
 */
function detectDrivingEvents(points: TripPoint[]): TripEvents {
  const events: TripEvents = {
    hardBrakingCount: 0,
    hardAccelerationCount: 0,
    speedingSeconds: 0,
    sharpTurnCount: 0,
    phonePickupCount: 0,
  };

  for (const event of locateDrivingEvents(points)) {
    switch (event.type) {
      case 'braking':
        events.hardBrakingCount++;
        break;
      case 'acceleration':
        events.hardAccelerationCount++;
        break;
      case 'cornering':
        events.sharpTurnCount++;
        break;
      case 'speeding':
        events.speedingSeconds += event.seconds ?? 0;
        break;
    }
  }

  return events;
}

/**
 * Compute phone usage score from pickup count and trip duration.
 * Rate = pickups per 10 minutes; score = max(20, 100 − rate × 16).
 * 0 pickups → 100 | 1/10 min → 84 | 5+/10 min → 20 (floor)
 */
function computePhoneUsageScore(phonePickupCount: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || phonePickupCount <= 0) return 100;
  const pickupsPerTenMin = (phonePickupCount / durationSeconds) * 600;
  return Math.max(20, Math.round(100 - pickupsPerTenMin * 16));
}

/**
 * Maximum realistic phone-pickup rate. There is no server-side accelerometer
 * stream to verify a client-reported pickup count against - unlike every
 * other event in this file, which is derived entirely from the GPS trace the
 * server already trusts, phone pickups are (for now) a client-reported
 * number the server has to take on faith. This cap is the defence against
 * that: no legitimate use of a phone while driving produces a pickup faster
 * than roughly once every 10 seconds sustained, so 6/minute is generous
 * headroom, not a tuned estimate of normal behaviour.
 */
const MAX_PICKUPS_PER_MINUTE = 6;

/**
 * Sanitise a client-reported phone-pickup count before it can reach
 * `events.phonePickupCount` or the score. Rejects anything that is not a
 * finite, positive number (guards against NaN/Infinity/negative values
 * corrupting `computePhoneUsageScore`'s arithmetic - `Math.max(20, NaN)` is
 * `NaN`, which would otherwise poison the whole composite score, not just
 * the phone-usage component), floors to a whole pickup, then caps the rate
 * at MAX_PICKUPS_PER_MINUTE so a malformed or malicious payload cannot
 * distort a driver's score.
 */
function sanitizePhonePickupCount(
  rawCount: number | undefined,
  durationSeconds: number
): number {
  if (rawCount === undefined || !Number.isFinite(rawCount) || rawCount <= 0) {
    return 0;
  }
  const count = Math.floor(rawCount);
  const durationMinutes = Math.max(1, durationSeconds) / 60;
  const cap = Math.max(1, Math.ceil(durationMinutes * MAX_PICKUPS_PER_MINUTE));
  return Math.min(count, cap);
}

/**
 * Normalize heading delta to -180 to 180 range
 */
function normalizeHeadingDelta(delta: number): number {
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

/**
 * Compute driving score from metrics and events
 *
 * Score breakdown:
 * - Speed Score (25%): Based on speed variance and compliance
 * - Braking Score (25%): Penalizes hard braking events
 * - Acceleration Score (20%): Penalizes aggressive acceleration
 * - Cornering Score (20%): Penalizes sharp turns
 * - Phone Usage Score (10%): Rate-based on a sanitised, client-reported
 *   pickup count (M2-DEC-1 Option A) - not GPS-derived like the other four,
 *   see sanitizePhonePickupCount and computeTripMetrics's header comment
 */
function computeDrivingScore(
  points: TripPoint[],
  events: TripEvents,
  speedVariance: number,
  avgSpeedMps: number,
  distanceMeters: number,
  durationSeconds: number
): { score: number; scoreBreakdown: ScoreBreakdown } {
  // Normalize metrics per mile for fair comparison
  const distanceMiles = Math.max(0.1, distanceMeters / 1609.34);

  // Speed Score (25%)
  // Lower variance = better score, also penalize excessive speeding
  const speedingPenalty = Math.min(30, (events.speedingSeconds / durationSeconds) * 100);
  const variancePenalty = Math.min(20, speedVariance * 2);
  const speedScore = Math.max(0, Math.min(100, 100 - speedingPenalty - variancePenalty));

  // Braking Score (25%)
  // Penalize hard braking events (up to -5 points per event, max -50)
  const brakingEventsPerMile = events.hardBrakingCount / distanceMiles;
  const brakingPenalty = Math.min(50, brakingEventsPerMile * 10);
  const brakingScore = Math.max(0, Math.min(100, 100 - brakingPenalty));

  // Acceleration Score (20%)
  // Penalize hard acceleration events
  const accelEventsPerMile = events.hardAccelerationCount / distanceMiles;
  const accelPenalty = Math.min(50, accelEventsPerMile * 8);
  const accelerationScore = Math.max(0, Math.min(100, 100 - accelPenalty));

  // Cornering Score (20%)
  // Penalize sharp turns
  const turnEventsPerMile = events.sharpTurnCount / distanceMiles;
  const turnPenalty = Math.min(50, turnEventsPerMile * 6);
  const corneringScore = Math.max(0, Math.min(100, 100 - turnPenalty));

  // Phone Usage Score (10%)
  // Rate-based: penalise app switches during the trip
  const phoneUsageScore = computePhoneUsageScore(events.phonePickupCount, durationSeconds);

  // Calculate weighted composite score
  const score = Math.round(
    speedScore * SCORE_WEIGHTS.speed +
    brakingScore * SCORE_WEIGHTS.braking +
    accelerationScore * SCORE_WEIGHTS.acceleration +
    corneringScore * SCORE_WEIGHTS.cornering +
    phoneUsageScore * SCORE_WEIGHTS.phoneUsage
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    scoreBreakdown: {
      speedScore: Math.round(speedScore),
      brakingScore: Math.round(brakingScore),
      accelerationScore: Math.round(accelerationScore),
      corneringScore: Math.round(corneringScore),
      phoneUsageScore: Math.round(phoneUsageScore),
    },
  };
}
