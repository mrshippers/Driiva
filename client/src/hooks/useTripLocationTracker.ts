/**
 * TRIP LOCATION TRACKER HOOK
 * ==========================
 * A reusable React hook for GPS tracking during trips.
 * 
 * Features:
 *   - Uses navigator.geolocation.watchPosition for continuous tracking
 *   - Configurable accuracy, timeout, and sampling rate
 *   - Graceful permission error handling
 *   - Start/stop/pause controls
 *   - Callbacks for each point and errors
 *   - Automatic cleanup on unmount
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { haversineMeters } from '@shared/tripProcessor';

// ============================================================================
// TYPES
// ============================================================================

export interface TrackedPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface TrackerOptions {
  /** Enable high accuracy GPS (uses more battery) */
  enableHighAccuracy?: boolean;
  /** Maximum age of cached position in ms */
  maximumAge?: number;
  /** Timeout for position request in ms */
  timeout?: number;
  /** Minimum time between points in ms (throttling) */
  minInterval?: number;
  /** Minimum distance change to record new point in meters */
  minDistance?: number;
}

export interface TrackerCallbacks {
  /** Called when a new valid point is captured */
  onPoint?: (point: TrackedPoint) => void;
  /** Called on geolocation errors */
  onError?: (error: GeolocationPositionError) => void;
  /** Called when tracking starts */
  onStart?: () => void;
  /** Called when tracking stops */
  onStop?: (points: TrackedPoint[]) => void;
}

export interface TrackerState {
  isTracking: boolean;
  isPaused: boolean;
  isPermissionGranted: boolean;
  isPermissionDenied: boolean;
  currentPosition: TrackedPoint | null;
  pointCount: number;
  totalDistance: number; // in meters
  error: GeolocationPositionError | null;
  errorMessage: string | null;
}

export interface TrackerActions {
  start: () => Promise<void>;
  stop: () => TrackedPoint[];
  pause: () => void;
  resume: () => void;
  clearError: () => void;
  getPoints: () => TrackedPoint[];
  requestPermission: () => Promise<boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<TrackerOptions> = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000,
  minInterval: 1000, // 1 second between points
  minDistance: 5, // 5 meters minimum movement
};

const PERMISSION_ERROR_MESSAGES: Record<number, string> = {
  1: 'Location permission denied. Please enable location access in your browser settings.',
  2: 'Location unavailable. Please check your GPS settings or try again.',
  3: 'Location request timed out. Please ensure you have GPS enabled.',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Haversine — canonical source: shared/tripProcessor.ts
const calculateDistanceMeters = haversineMeters;

/**
 * Convert GeolocationPosition to TrackedPoint
 */
function positionToPoint(position: GeolocationPosition): TrackedPoint {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: position.timestamp,
  };
}

// ============================================================================
// HOOK
// ============================================================================

export function useTripLocationTracker(
  options: TrackerOptions = {},
  callbacks: TrackerCallbacks = {}
): TrackerState & TrackerActions {
  // Merge options with defaults
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  // Refs for mutable state that shouldn't trigger re-renders
  const watchIdRef = useRef<number | null>(null);
  const pointsRef = useRef<TrackedPoint[]>([]);
  const lastPointTimeRef = useRef<number>(0);
  const lastPointRef = useRef<TrackedPoint | null>(null);
  const totalDistanceRef = useRef<number>(0);
  const callbacksRef = useRef(callbacks);
  
  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // State
  const [state, setState] = useState<TrackerState>({
    isTracking: false,
    isPaused: false,
    isPermissionGranted: false,
    isPermissionDenied: false,
    currentPosition: null,
    pointCount: 0,
    totalDistance: 0,
    error: null,
    errorMessage: null,
  });

  /**
   * Request location permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        isPermissionDenied: true,
        errorMessage: 'Geolocation is not supported by this browser.',
      }));
      return false;
    }

    try {
      // Try to get current position to trigger permission prompt
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: mergedOptions.enableHighAccuracy,
          timeout: mergedOptions.timeout,
          maximumAge: mergedOptions.maximumAge,
        });
      });

      setState(prev => ({
        ...prev,
        isPermissionGranted: true,
        isPermissionDenied: false,
        error: null,
        errorMessage: null,
      }));

      return true;
    } catch (error) {
      const geoError = error as GeolocationPositionError;
      const isDenied = geoError.code === 1;
      
      setState(prev => ({
        ...prev,
        isPermissionGranted: false,
        isPermissionDenied: isDenied,
        error: geoError,
        errorMessage: PERMISSION_ERROR_MESSAGES[geoError.code] || geoError.message,
      }));

      return false;
    }
  }, [mergedOptions]);

  /**
   * Handle successful position update
   */
  const handlePositionSuccess = useCallback((position: GeolocationPosition) => {
    const now = Date.now();
    const point = positionToPoint(position);
    
    // Throttle by time
    if (now - lastPointTimeRef.current < mergedOptions.minInterval) {
      return;
    }

    // Reject inaccurate readings (urban canyons, indoor, weak signal)
    if (point.accuracy > 25) {
      setState(prev => ({ ...prev, currentPosition: point }));
      return;
    }

    // Throttle by distance (if we have a previous point)
    if (lastPointRef.current) {
      const distance = calculateDistanceMeters(
        lastPointRef.current.latitude,
        lastPointRef.current.longitude,
        point.latitude,
        point.longitude
      );

      // Reject GPS spikes: derived speed > 80 m/s (~180 mph) is physically implausible
      const dt = (point.timestamp - lastPointRef.current.timestamp) / 1000;
      if (dt > 0 && distance / dt > 80) {
        return;
      }

      // Only record if moved enough
      if (distance < mergedOptions.minDistance) {
        // Still update current position for UI, but don't record
        setState(prev => ({ ...prev, currentPosition: point }));
        return;
      }

      // Add distance to total
      totalDistanceRef.current += distance;
    }

    // Record point
    pointsRef.current.push(point);
    lastPointTimeRef.current = now;
    lastPointRef.current = point;

    // Update state
    setState(prev => ({
      ...prev,
      currentPosition: point,
      pointCount: pointsRef.current.length,
      totalDistance: totalDistanceRef.current,
      error: null,
      errorMessage: null,
    }));

    // Fire callback
    callbacksRef.current.onPoint?.(point);
  }, [mergedOptions]);

  /**
   * Handle position error
   */
  const handlePositionError = useCallback((error: GeolocationPositionError) => {
    const isDenied = error.code === 1;
    
    setState(prev => ({
      ...prev,
      isPermissionDenied: isDenied,
      error,
      errorMessage: PERMISSION_ERROR_MESSAGES[error.code] || error.message,
    }));

    // Fire callback
    callbacksRef.current.onError?.(error);

    // If permission denied, stop tracking
    if (isDenied && watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setState(prev => ({ ...prev, isTracking: false }));
    }
  }, []);

  /**
   * Start tracking
   */
  const start = useCallback(async (): Promise<void> => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        errorMessage: 'Geolocation is not supported by this browser.',
      }));
      return;
    }

    // Request permission first if not granted
    if (!state.isPermissionGranted) {
      const granted = await requestPermission();
      if (!granted) {
        return;
      }
    }

    // Clear previous data
    pointsRef.current = [];
    lastPointTimeRef.current = 0;
    lastPointRef.current = null;
    totalDistanceRef.current = 0;

    // Start watching
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: mergedOptions.enableHighAccuracy,
        timeout: mergedOptions.timeout,
        maximumAge: mergedOptions.maximumAge,
      }
    );

    setState(prev => ({
      ...prev,
      isTracking: true,
      isPaused: false,
      pointCount: 0,
      totalDistance: 0,
      error: null,
      errorMessage: null,
    }));

    callbacksRef.current.onStart?.();
  }, [state.isPermissionGranted, requestPermission, handlePositionSuccess, handlePositionError, mergedOptions]);

  /**
   * Stop tracking and return all captured points
   */
  const stop = useCallback((): TrackedPoint[] => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    const points = [...pointsRef.current];
    
    setState(prev => ({
      ...prev,
      isTracking: false,
      isPaused: false,
    }));

    callbacksRef.current.onStop?.(points);

    return points;
  }, []);

  /**
   * Pause tracking (keeps watch but ignores updates)
   */
  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: true }));
  }, []);

  /**
   * Resume tracking after pause
   */
  const resume = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: false }));
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
      errorMessage: null,
    }));
  }, []);

  /**
   * Get all captured points
   */
  const getPoints = useCallback((): TrackedPoint[] => {
    return [...pointsRef.current];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return {
    // State
    ...state,
    // Actions
    start,
    stop,
    pause,
    resume,
    clearError,
    getPoints,
    requestPermission,
  };
}

export default useTripLocationTracker;
