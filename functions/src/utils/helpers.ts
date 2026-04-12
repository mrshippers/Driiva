/**
 * HELPER UTILITIES
 * ================
 * Shared helper functions for Cloud Functions.
 */

import * as admin from 'firebase-admin';
import { TripLocation } from '../types';
import { haversineMeters } from '../shared/tripProcessor';

/**
 * Get current pool period string (e.g., "2026-02")
 */
export function getCurrentPoolPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get previous pool period string
 */
export function getPreviousPoolPeriod(): string {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get share ID for a user and period
 */
export function getShareId(userId: string, period: string): string {
  return `${period}_${userId}`;
}

/**
 * Get ISO week number
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get period string for leaderboard type
 */
export function getCurrentPeriodForType(periodType: string): string {
  const now = new Date();
  
  switch (periodType) {
    case 'weekly':
      const weekNum = getWeekNumber(now);
      return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    case 'monthly':
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    case 'all_time':
      return 'all_time';
    default:
      return getCurrentPoolPeriod();
  }
}

/**
 * Calculate weighted average
 */
export function weightedAverage(oldValue: number, newValue: number, oldWeight: number): number {
  if (oldWeight === 0) return newValue;
  const result = (oldValue * oldWeight + newValue) / (oldWeight + 1);
  return Math.round(result * 100) / 100;
}

/**
 * Build route summary string
 */
export function buildRouteSummary(
  start: TripLocation,
  end: TripLocation
): string {
  const startLabel = start.placeType 
    ? start.placeType.charAt(0).toUpperCase() + start.placeType.slice(1)
    : truncateAddress(start.address);
  
  const endLabel = end.placeType
    ? end.placeType.charAt(0).toUpperCase() + end.placeType.slice(1)
    : truncateAddress(end.address);
  
  return `${startLabel} → ${endLabel}`;
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string | null): string {
  if (!address) return 'Unknown';
  
  const parts = address.split(',');
  const firstPart = parts[0].trim();
  
  return firstPart.length > 20 ? firstPart.substring(0, 17) + '...' : firstPart;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Delegates to the canonical shared/tripProcessor.ts implementation.
 */
export const calculateDistance = haversineMeters;

/**
 * Check if timestamp is during night hours (10 PM - 6 AM)
 */
export function isNightTime(timestamp: admin.firestore.Timestamp): boolean {
  const date = timestamp.toDate();
  const hour = date.getHours();
  return hour >= 22 || hour < 6;
}

/**
 * Check if timestamp is during rush hour (7-9 AM or 4-7 PM on weekdays)
 */
export function isRushHour(timestamp: admin.firestore.Timestamp): boolean {
  const date = timestamp.toDate();
  const day = date.getDay();
  const hour = date.getHours();
  
  // Weekdays only
  if (day === 0 || day === 6) return false;
  
  // Morning rush: 7-9 AM
  if (hour >= 7 && hour < 9) return true;
  
  // Evening rush: 4-7 PM
  if (hour >= 16 && hour < 19) return true;
  
  return false;
}

/**
 * Detect anomalies in trip data
 */
export function detectAnomalies(trip: {
  distanceMeters: number;
  durationSeconds: number;
  startLocation: TripLocation;
  endLocation: TripLocation;
}): {
  hasGpsJumps: boolean;
  hasImpossibleSpeed: boolean;
  isDuplicate: boolean;
  flaggedForReview: boolean;
} {
  const anomalies = {
    hasGpsJumps: false,
    hasImpossibleSpeed: false,
    isDuplicate: false,
    flaggedForReview: false,
  };
  
  // Check for impossible speed (> 200 mph average)
  if (trip.durationSeconds > 0) {
    const avgSpeedMph = (trip.distanceMeters / 1609.34) / (trip.durationSeconds / 3600);
    if (avgSpeedMph > 200) {
      anomalies.hasImpossibleSpeed = true;
      anomalies.flaggedForReview = true;
    }
  }
  
  // Check for GPS jumps (straight-line distance much less than route distance)
  const straightLineDistance = calculateDistance(
    trip.startLocation.lat,
    trip.startLocation.lng,
    trip.endLocation.lat,
    trip.endLocation.lng
  );
  
  // If route is more than 5x the straight-line distance, might have GPS issues
  if (trip.distanceMeters > straightLineDistance * 5 && straightLineDistance > 100) {
    anomalies.hasGpsJumps = true;
    // Only flag for review if the discrepancy is extreme
    if (trip.distanceMeters > straightLineDistance * 10) {
      anomalies.flaggedForReview = true;
    }
  }
  
  return anomalies;
}

/**
 * Calculate risk tier based on score
 */
export function calculateRiskTier(score: number): 'low' | 'medium' | 'high' {
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  return 'high';
}

/**
 * Calculate projected refund based on score and contribution.
 * @deprecated Use shared/refundCalculator.ts::calculateRefundCents for new code.
 * Kept for backward compatibility — delegates to the canonical formula.
 */
export function calculateProjectedRefund(
  score: number,
  contributionCents: number,
  safetyFactor: number,
  _refundRate: number
): number {
  // Canonical formula: blended score → refund rate 5-15% → apply safety factor
  const clamped = Math.max(50, Math.min(100, score));
  const rate = 0.05 + ((clamped - 50) / 50) * 0.10;
  const rawRefund = contributionCents * rate * safetyFactor;
  return Math.round(rawRefund);
}

// ============================================================================
// TRIP METRICS COMPUTATION
// ============================================================================
// Uses the canonical shared/tripProcessor.ts (copied at build time via prebuild).

import { TripPoint, ScoreBreakdown, TripEvents, ComputedTripMetrics } from '../types';

/**
 * Compute trip metrics from raw GPS points
 * This is the core algorithm that processes GPS data to derive metrics and scores.
 */
export function computeTripMetrics(
  points: TripPoint[],
  startTimestampMs: number
): ComputedTripMetrics {
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

  // 4. Detect driving events
  const events = detectDrivingEvents(sortedPoints);

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
function getDefaultMetrics(): ComputedTripMetrics {
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

/**
 * Detect driving events from GPS points
 */
function detectDrivingEvents(points: TripPoint[]): TripEvents {
  const events: TripEvents = {
    hardBrakingCount: 0,
    hardAccelerationCount: 0,
    speedingSeconds: 0,
    sharpTurnCount: 0,
    phonePickupCount: 0,
  };

  if (points.length < 2) {
    return events;
  }

  // Thresholds
  const HARD_BRAKING_THRESHOLD = -3.5; // m/s² (deceleration)
  const HARD_ACCEL_THRESHOLD = 3.0;    // m/s² (acceleration)
  const SHARP_TURN_THRESHOLD = 30;     // degrees per second
  const SPEED_LIMIT_MPS = 31.3;        // ~70 mph in m/s

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
      events.hardBrakingCount++;
    }

    // Hard acceleration detection
    if (acceleration > HARD_ACCEL_THRESHOLD) {
      events.hardAccelerationCount++;
    }

    // Speeding detection
    if (currSpeed > SPEED_LIMIT_MPS) {
      events.speedingSeconds += Math.round(dt);
    }

    // Sharp turn detection (heading change rate)
    const headingDelta = Math.abs(normalizeHeadingDelta(curr.hdg - prev.hdg));
    const headingRate = headingDelta / dt;
    if (headingRate > SHARP_TURN_THRESHOLD && currSpeed > 5) {
      events.sharpTurnCount++;
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
 * - Phone Usage Score (10%): Placeholder (no phone detection yet)
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
    speedScore * 0.25 +
    brakingScore * 0.25 +
    accelerationScore * 0.20 +
    corneringScore * 0.20 +
    phoneUsageScore * 0.10
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
