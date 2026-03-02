/**
 * DASHBOARD DATA HOOK
 * ===================
 * Real-time Firestore subscription for dashboard data.
 * 
 * Subscribes to:
 *   - users/{userId} (driving profile, recent trips, pool share)
 *   - trips where userId = userId, ordered by startedAt desc, limit 3
 *   - policies where userId = userId and status = 'active'
 *   - communityPool/current (global pool state)
 * 
 * Returns a unified data object optimized for the dashboard UI.
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import {
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { OnlineStatusContext } from '@/contexts/OnlineStatusContext';
import {
  COLLECTION_NAMES,
  UserDocument,
  TripDocument,
  PolicyDocument,
  CommunityPoolDocument,
  DrivingProfileData,
  ActivePolicySummary,
  PoolShareSummary,
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
  // User Profile
  displayName: string;
  photoURL: string | null;
  phoneNumber: string | null;
  vehicle: DashboardVehicle | null;
  email: string | null;
  
  // Driving Stats
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
  
  // Recent Trips
  trips: DashboardTrip[];
  
  // Policy
  hasActivePolicy: boolean;
  policyNumber: string | null;
  premiumAmount: number; // in pounds/dollars
  coverageType: string | null;
  renewalDate: Date | null;
  
  // Community Pool
  poolTotal: number;        // in pounds/dollars
  poolShare: number;        // user's projected refund
  poolContribution: number; // user's total contribution
  sharePercentage: number;
  safetyFactor: number;
  activeParticipants: number;
  
  // Computed
  projectedRefund: number;

  // Onboarding-collected profile fields
  age: number | null;
  postcode: string | null;
  annualMileage: string | null;
  currentInsurer: string | null;

  // Meta
  /** Formatted account creation date e.g. "January 2025", null if unavailable */
  memberSince: string | null;
}

export interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

const DEFAULT_DASHBOARD_DATA: DashboardData = {
  displayName: 'Driver',
  photoURL: null,
  phoneNumber: null,
  vehicle: null,
  email: null,
  drivingScore: 100,
  scoreBreakdown: {
    speed: 100,
    braking: 100,
    acceleration: 100,
    cornering: 100,
    phoneUsage: 100,
  },
  totalTrips: 0,
  totalMiles: 0,
  totalMinutes: 0,
  streakDays: 0,
  riskTier: 'low',
  trips: [],
  hasActivePolicy: false,
  policyNumber: null,
  premiumAmount: 0,
  coverageType: null,
  renewalDate: null,
  poolTotal: 0,
  poolShare: 0,
  poolContribution: 0,
  sharePercentage: 0,
  safetyFactor: 1.0,
  activeParticipants: 0,
  projectedRefund: 0,
  age: null,
  postcode: null,
  annualMileage: null,
  currentInsurer: null,
  memberSince: null,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a Firestore timestamp to a readable date string
 */
function formatTripDate(timestamp: Timestamp | null): string {
  if (!timestamp) return 'Unknown';
  const date = timestamp.toDate();
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Convert TripDocument to DashboardTrip
 */
function tripToDisplayTrip(trip: TripDocument): DashboardTrip {
  const distanceMiles = trip.distanceMeters / 1609.34;
  const durationMinutes = trip.durationSeconds / 60;
  
  // Build route summary
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

/**
 * Convert RecentTripSummary to DashboardTrip
 */
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

/**
 * Calculate projected refund based on score and premium
 */
function calculateProjectedRefund(score: number, premiumCents: number): number {
  if (score < 70) return 0;
  const scoreRange = Math.max(0, score - 70);
  const baseRefund = 5;
  const additionalRefund = (scoreRange / 30) * 10;
  const totalPercentage = Math.min(baseRefund + additionalRefund, 15);
  return Math.round((totalPercentage / 100) * (premiumCents / 100));
}

// ============================================================================
// HOOK
// ============================================================================

export function useDashboardData(userId: string | null): UseDashboardDataResult {
  const onlineStatus = useContext(OnlineStatusContext);
  const reportFirestoreError = onlineStatus?.reportFirestoreError ?? (() => {});

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Internal state for combining multiple subscriptions
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  // Tracks whether the FIRST userDoc snapshot has fired (even if doc doesn't exist)
  const [userDocLoaded, setUserDocLoaded] = useState(false);
  const [trips, setTrips] = useState<TripDocument[]>([]);
  const [policy, setPolicy] = useState<PolicyDocument | null>(null);
  const [pool, setPool] = useState<CommunityPoolDocument | null>(null);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // Subscribe to all data sources
  useEffect(() => {
    if (!userId || !isFirebaseConfigured || !db) {
      setLoading(false);
      setData(DEFAULT_DASHBOARD_DATA);
      return;
    }

    setLoading(true);
    setError(null);
    setUserDocLoaded(false);

    const unsubscribes: Unsubscribe[] = [];

    try {
      // 1. Subscribe to user document (has denormalized dashboard data)
      const userRef = doc(db, COLLECTION_NAMES.USERS, userId);
      unsubscribes.push(
        onSnapshot(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setUserDoc(snapshot.data() as UserDocument);
            } else {
              setUserDoc(null);
            }
            // Signal that the first snapshot has resolved (doc exists or not)
            setUserDocLoaded(true);
          },
          (err) => {
            console.error('[useDashboardData] User subscription error:', err);
            reportFirestoreError();
            setError(err);
          }
        )
      );

      // 2. Subscribe to recent trips (last 3, completed)
      const tripsRef = collection(db, COLLECTION_NAMES.TRIPS);
      const tripsQuery = query(
        tripsRef,
        where('userId', '==', userId),
        where('status', '==', 'completed'),
        orderBy('endedAt', 'desc'),
        limit(3)
      );
      unsubscribes.push(
        onSnapshot(
          tripsQuery,
          (snapshot) => {
            const tripDocs = snapshot.docs.map(doc => doc.data() as TripDocument);
            setTrips(tripDocs);
          },
          (err) => {
            console.error('[useDashboardData] Trips subscription error:', err);
            reportFirestoreError();
          }
        )
      );

      // 3. Subscribe to active policy
      const policiesRef = collection(db, COLLECTION_NAMES.POLICIES);
      const policyQuery = query(
        policiesRef,
        where('userId', '==', userId),
        where('status', '==', 'active'),
        limit(1)
      );
      unsubscribes.push(
        onSnapshot(
          policyQuery,
          (snapshot) => {
            if (!snapshot.empty) {
              setPolicy(snapshot.docs[0].data() as PolicyDocument);
            } else {
              setPolicy(null);
            }
          },
          (err) => {
            console.error('[useDashboardData] Policy subscription error:', err);
            reportFirestoreError();
          }
        )
      );

      // 4. Subscribe to community pool
      const poolRef = doc(db, COLLECTION_NAMES.COMMUNITY_POOL, 'current');
      unsubscribes.push(
        onSnapshot(
          poolRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setPool(snapshot.data() as CommunityPoolDocument);
            } else {
              setPool(null);
            }
          },
          (err) => {
            console.error('[useDashboardData] Pool subscription error:', err);
            reportFirestoreError();
          }
        )
      );

    } catch (err) {
      console.error('[useDashboardData] Setup error:', err);
      setError(err instanceof Error ? err : new Error('Failed to setup subscriptions'));
      setLoading(false);
    }

    // Cleanup subscriptions
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [userId, refreshKey]);

  // Combine all data sources into dashboard data
  useEffect(() => {
    // Wait for the first userDoc snapshot to resolve before assembling data.
    // Using userDocLoaded (not !userDoc) so we don't wait forever when the doc doesn't exist.
    if (!userDocLoaded && userId && isFirebaseConfigured) {
      return;
    }

    const profile = userDoc?.drivingProfile || DEFAULT_DRIVING_PROFILE;
    const poolShare = userDoc?.poolShare || { ...DEFAULT_POOL_SHARE, lastUpdatedAt: Timestamp.now() };
    
    // Prefer denormalized recent trips from user doc, fall back to queried trips
    const recentTrips = userDoc?.recentTrips && userDoc.recentTrips.length > 0
      ? userDoc.recentTrips.map(summaryToDisplayTrip)
      : trips.map(tripToDisplayTrip);

    // Calculate premium in pounds (from cents)
    const premiumPounds = policy?.currentPremiumCents 
      ? policy.currentPremiumCents / 100 
      : (userDoc?.activePolicy?.premiumCents || 0) / 100;

    // Calculate projected refund
    const projectedRefund = calculateProjectedRefund(
      profile.currentScore,
      policy?.currentPremiumCents || userDoc?.activePolicy?.premiumCents || 0
    );

    // Derive account creation date — createdAt may be a Firestore Timestamp or ISO string
    let memberSince: string | null = null;
    const rawCreatedAt = userDoc?.createdAt as unknown;
    if (rawCreatedAt) {
      try {
        const date: Date | null = typeof rawCreatedAt === 'string'
          ? new Date(rawCreatedAt)
          : typeof (rawCreatedAt as any)?.toDate === 'function'
            ? (rawCreatedAt as any).toDate()
            : null;
        if (date && !isNaN(date.getTime())) {
          memberSince = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        }
      } catch { /* ignore malformed dates */ }
    }

    const dashboardData: DashboardData = {
      // User Profile — prefer displayName, fall back to fullName (set by signup before Cloud Function runs)
      displayName: userDoc?.displayName || (userDoc as any)?.fullName || 'Driver',
      photoURL: userDoc?.photoURL || null,
      phoneNumber: userDoc?.phoneNumber || null,
      vehicle: (userDoc as any)?.vehicle ?? null,
      email: userDoc?.email || null,
      
      // Driving Stats
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
      
      // Recent Trips
      trips: recentTrips,
      
      // Policy
      hasActivePolicy: !!policy || !!userDoc?.activePolicy,
      policyNumber: policy?.policyNumber || null,
      premiumAmount: premiumPounds,
      coverageType: policy?.coverageType || userDoc?.activePolicy?.coverageType || null,
      renewalDate: policy?.renewalDate?.toDate() || userDoc?.activePolicy?.renewalDate?.toDate() || null,
      
      // Community Pool
      poolTotal: pool ? pool.totalPoolCents / 100 : 0,
      poolShare: poolShare.currentShareCents / 100,
      poolContribution: poolShare.contributionCents / 100,
      sharePercentage: poolShare.sharePercentage,
      safetyFactor: pool?.safetyFactor || 1.0,
      activeParticipants: pool?.activeParticipants || 0,
      
      // Computed
      projectedRefund,

      // Onboarding-collected profile fields
      age: (userDoc as any)?.age ?? null,
      postcode: (userDoc as any)?.postcode ?? null,
      annualMileage: (userDoc as any)?.annualMileage ?? null,
      currentInsurer: (userDoc as any)?.currentInsurer ?? null,

      // Meta
      memberSince,
    };

    setData(dashboardData);
    setLoading(false);
  }, [userDoc, userDocLoaded, trips, policy, pool, userId, loading]);

  return { data, loading, error, refresh };
}

export default useDashboardData;
