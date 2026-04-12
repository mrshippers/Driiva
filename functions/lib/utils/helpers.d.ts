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
export declare function getCurrentPoolPeriod(): string;
/**
 * Get previous pool period string
 */
export declare function getPreviousPoolPeriod(): string;
/**
 * Get share ID for a user and period
 */
export declare function getShareId(userId: string, period: string): string;
/**
 * Get ISO week number
 */
export declare function getWeekNumber(date: Date): number;
/**
 * Get period string for leaderboard type
 */
export declare function getCurrentPeriodForType(periodType: string): string;
/**
 * Calculate weighted average
 */
export declare function weightedAverage(oldValue: number, newValue: number, oldWeight: number): number;
/**
 * Build route summary string
 */
export declare function buildRouteSummary(start: TripLocation, end: TripLocation): string;
/**
 * Truncate address for display
 */
export declare function truncateAddress(address: string | null): string;
/**
 * Calculate distance between two coordinates using Haversine formula.
 * Delegates to the canonical shared/tripProcessor.ts implementation.
 */
export declare const calculateDistance: typeof haversineMeters;
/**
 * Check if timestamp is during night hours (10 PM - 6 AM)
 */
export declare function isNightTime(timestamp: admin.firestore.Timestamp): boolean;
/**
 * Check if timestamp is during rush hour (7-9 AM or 4-7 PM on weekdays)
 */
export declare function isRushHour(timestamp: admin.firestore.Timestamp): boolean;
/**
 * Detect anomalies in trip data
 */
export declare function detectAnomalies(trip: {
    distanceMeters: number;
    durationSeconds: number;
    startLocation: TripLocation;
    endLocation: TripLocation;
}): {
    hasGpsJumps: boolean;
    hasImpossibleSpeed: boolean;
    isDuplicate: boolean;
    flaggedForReview: boolean;
};
/**
 * Calculate risk tier based on score
 */
export declare function calculateRiskTier(score: number): 'low' | 'medium' | 'high';
/**
 * Calculate projected refund based on score and contribution.
 * @deprecated Use shared/refundCalculator.ts::calculateRefundCents for new code.
 * Kept for backward compatibility — delegates to the canonical formula.
 */
export declare function calculateProjectedRefund(score: number, contributionCents: number, safetyFactor: number, _refundRate: number): number;
import { TripPoint, ComputedTripMetrics } from '../types';
/**
 * Compute trip metrics from raw GPS points
 * This is the core algorithm that processes GPS data to derive metrics and scores.
 */
export declare function computeTripMetrics(points: TripPoint[], startTimestampMs: number): ComputedTripMetrics;
//# sourceMappingURL=helpers.d.ts.map