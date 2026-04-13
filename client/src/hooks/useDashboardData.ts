/**
 * DASHBOARD DATA HOOK
 * ===================
 * Composes useUserProfile, useRecentTrips, useActivePolicy, usePoolState
 * into a single unified DashboardData object for the dashboard UI.
 *
 * This hook no longer contains any direct Firestore listeners — all
 * real-time subscriptions are delegated to the generic primitives.
 */

import { useMemo, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useUserProfile } from './useUserProfile';
import { useRecentTrips } from './useRecentTrips';
import { useActivePolicy } from './useActivePolicy';
import { usePoolState } from './usePoolState';
import { projectedRefundCents } from '../../../shared/refundCalculator';
import {
  TripDocument,
  RecentTripSummary,
  DEFAULT_DRIVING_PROFILE,
  DEFAULT_POOL_SHARE,
} from '../../../shared/firestore-types';

// ============================================================================
// TYPES
// ============================================================================

export interface DashboardTrip {
  id: string;
  from: string;
  to: string;
  score: number;
  distance: number; // miles
  date: string;     // formatted date
  duration: number; // minutes
}

export interface DashboardVehicle {
  make: string;
  model: string;
  year: number;
  color: string | null;
  vin: string | null;
}

export interface DashboardData {
  displayName: string;
  photoURL: string | null;
  phoneNumber: string | null;
  vehicle: DashboardVehicle | null;
  email: string | null;
  drivingScore: number;
  scoreBreakdown: {
    speed: number;
    braking: number;
    acceleration: number;
    cornering: number;
    phoneUsage: number;
  };
  totalTrips: number;
  totalMiles: number;
  totalMinutes: number;
  streakDays: number;
  riskTier: 'low' | 'medium' | 'high';
  trips: DashboardTrip[];
  hasActivePolicy: boolean;
  policyNumber: string | null;
  premiumAmount: number;
  coverageType: string | null;
  renewalDate: Date | null;
  poolTotal: number;
  poolShare: number;
  poolContribution: number;
  sharePercentage: number;
  safetyFactor: number;
  activeParticipants: number;
  projectedRefund: number;
  age: number | null;
  postcode: string | null;
  annualMileage: string | null;
  currentInsurer: string | null;
  memberSince: string | null;
}

export interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTripDate(timestamp: Timestamp | null): string {
  if (!timestamp) return 'Unknown';
  const date = timestamp.toDate();
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function tripToDisplayTrip(trip: TripDocument): DashboardTrip {
  const distanceMiles = trip.distanceMeters / 1609.34;
  const durationMinutes = trip.durationSeconds / 60;
  const fromLabel = trip.startLocation.placeType
    ? capitalizeFirst(trip.startLocation.placeType)
    : truncateAddress(trip.startLocation.address);
  const toLabel = trip.endLocation.placeType
    ? capitalizeFirst(trip.endLocation.placeType)
    : truncateAddress(trip.endLocation.address);
  return {
    id: trip.tripId,
    from: fromLabel,
    to: toLabel,
    score: Math.round(trip.score),
    distance: Math.round(distanceMiles * 10) / 10,
    date: formatTripDate(trip.endedAt),
    duration: Math.round(durationMinutes),
  };
}

function summaryToDisplayTrip(summary: RecentTripSummary): DashboardTrip {
  return {
    id: summary.tripId,
    from: summary.routeSummary.split(' → ')[0] || 'Unknown',
    to: summary.routeSummary.split(' → ')[1] || 'Unknown',
    score: Math.round(summary.score),
    distance: Math.round(summary.distanceMiles * 10) / 10,
    date: formatTripDate(summary.endedAt),
    duration: Math.round(summary.durationMinutes),
  };
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncateAddress(address: string | null): string {
  if (!address) return 'Unknown';
  const parts = address.split(',');
  const firstPart = parts[0].trim();
  return firstPart.length > 15 ? firstPart.substring(0, 12) + '...' : firstPart;
}

function calculateProjectedRefund(score: number, premiumCents: number): number {
  return projectedRefundCents(score, premiumCents);
}

function parseMemberSince(rawCreatedAt: unknown): string | null {
  if (!rawCreatedAt) return null;
  try {
    const date: Date | null = typeof rawCreatedAt === 'string'
      ? new Date(rawCreatedAt)
      : typeof (rawCreatedAt as any)?.toDate === 'function'
        ? (rawCreatedAt as any).toDate()
        : null;
    if (date && !isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
  } catch { /* ignore malformed dates */ }
  return null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useDashboardData(userId: string | null): UseDashboardDataResult {
  const { userDoc, loading: userLoading, error: userError, refresh: refreshUser } = useUserProfile(userId);
  const { trips, loading: tripsLoading, refresh: refreshTrips } = useRecentTrips(userId);
  const { policy, loading: policyLoading, refresh: refreshPolicy } = useActivePolicy(userId);
  const { pool, loading: poolLoading, refresh: refreshPool } = usePoolState();

  const loading = userLoading || tripsLoading || policyLoading || poolLoading;
  const error = userError;

  const refresh = useCallback(() => {
    refreshUser();
    refreshTrips();
    refreshPolicy();
    refreshPool();
  }, [refreshUser, refreshTrips, refreshPolicy, refreshPool]);

  const data = useMemo<DashboardData | null>(() => {
    // Don't assemble until the user doc has resolved (even if null)
    if (userLoading && userId) return null;

    const profile = userDoc?.drivingProfile || DEFAULT_DRIVING_PROFILE;
    const poolShare = userDoc?.poolShare || { ...DEFAULT_POOL_SHARE, lastUpdatedAt: Timestamp.now() };

    const recentTrips = userDoc?.recentTrips && userDoc.recentTrips.length > 0
      ? userDoc.recentTrips.map(summaryToDisplayTrip)
      : trips.map(tripToDisplayTrip);

    const premiumPounds = policy?.currentPremiumCents
      ? policy.currentPremiumCents / 100
      : (userDoc?.activePolicy?.premiumCents || 0) / 100;

    const projectedRefund = calculateProjectedRefund(
      profile.currentScore,
      policy?.currentPremiumCents || userDoc?.activePolicy?.premiumCents || 0,
    );

    return {
      displayName: userDoc?.displayName || (userDoc as any)?.fullName || 'Driver',
      photoURL: userDoc?.photoURL || null,
      phoneNumber: userDoc?.phoneNumber || null,
      vehicle: (userDoc as any)?.vehicle ?? null,
      email: userDoc?.email || null,
      drivingScore: Math.round(profile.currentScore),
      scoreBreakdown: {
        speed: Math.round(profile.scoreBreakdown.speedScore),
        braking: Math.round(profile.scoreBreakdown.brakingScore),
        acceleration: Math.round(profile.scoreBreakdown.accelerationScore),
        cornering: Math.round(profile.scoreBreakdown.corneringScore),
        phoneUsage: Math.round(profile.scoreBreakdown.phoneUsageScore),
      },
      totalTrips: profile.totalTrips,
      totalMiles: Math.round(profile.totalMiles),
      totalMinutes: Math.round(profile.totalDrivingMinutes),
      streakDays: profile.streakDays,
      riskTier: profile.riskTier,
      trips: recentTrips,
      hasActivePolicy: !!policy || !!userDoc?.activePolicy,
      policyNumber: policy?.policyNumber || null,
      premiumAmount: premiumPounds,
      coverageType: policy?.coverageType || userDoc?.activePolicy?.coverageType || null,
      renewalDate: policy?.renewalDate?.toDate() || userDoc?.activePolicy?.renewalDate?.toDate() || null,
      poolTotal: pool ? pool.totalPoolCents / 100 : 0,
      poolShare: poolShare.currentShareCents / 100,
      poolContribution: poolShare.contributionCents / 100,
      sharePercentage: poolShare.sharePercentage,
      safetyFactor: pool?.safetyFactor || 1.0,
      activeParticipants: pool?.activeParticipants || 0,
      projectedRefund,
      age: (userDoc as any)?.age ?? null,
      postcode: (userDoc as any)?.postcode ?? null,
      annualMileage: (userDoc as any)?.annualMileage ?? null,
      currentInsurer: (userDoc as any)?.currentInsurer ?? null,
      memberSince: parseMemberSince(userDoc?.createdAt),
    };
  }, [userDoc, userLoading, userId, trips, policy, pool]);

  return { data, loading, error, refresh };
}

export default useDashboardData;
