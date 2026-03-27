/**
 * COMMUNITY DATA HOOK
 * ===================
 * Real-time Firestore subscriptions for community pool and leaderboard data.
 * 
 * Subscribes to:
 *   - communityPool/current (global pool state)
 *   - poolShares/{period}_{userId} (user's share for current period)
 *   - leaderboard/{period}_{periodType} (rankings)
 * 
 * Encapsulates all Firestore subscription logic so components stay dumb.
 */

import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import {
  doc,
  onSnapshot,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { OnlineStatusContext } from '@/contexts/OnlineStatusContext';
import { usePoolState } from './usePoolState';
import {
  COLLECTION_NAMES,
  CommunityPoolDocument,
  PoolShareDocument,
  LeaderboardDocument,
  LeaderboardRanking,
} from '../../../shared/firestore-types';

// ============================================================================
// TYPES
// ============================================================================

export interface CommunityPoolData {
  // Pool totals
  totalPoolCents: number;
  totalPoolPounds: number;
  totalContributionsCents: number;
  totalPayoutsCents: number;
  reserveCents: number;
  
  // Participants
  activeParticipants: number;
  totalParticipantsEver: number;
  
  // Pool metrics
  averagePoolScore: number;
  safetyFactor: number;
  claimsThisPeriod: number;
  projectedRefundRate: number;
  
  // Period
  periodStart: Date | null;
  periodEnd: Date | null;
  periodType: 'monthly' | 'quarterly';
  daysRemaining: number;
  
  // Last update
  lastCalculatedAt: Date | null;
}

export interface UserPoolShareData {
  // Share details
  shareId: string;
  poolPeriod: string;
  
  // Contributions
  contributionCents: number;
  contributionPounds: number;
  contributionCount: number;
  
  // Share calculation
  sharePercentage: number;
  weightedScore: number;
  
  // Refunds
  baseRefundCents: number;
  projectedRefundCents: number;
  projectedRefundPounds: number;
  
  // Activity
  tripsIncluded: number;
  milesIncluded: number;
  averageScore: number;
  
  // Status
  status: 'active' | 'finalized' | 'paid_out';
  eligibleForRefund: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  anonymizedName: string; // e.g., "Driver #42" or "speedracer_***"
  score: number;
  totalMiles: number;
  totalTrips: number;
  change: number;
  changeType: 'up' | 'down' | 'same';
  isCurrentUser: boolean;
}

export interface LeaderboardData {
  // Metadata
  period: string;
  periodType: 'weekly' | 'monthly' | 'all_time';
  calculatedAt: Date | null;
  nextCalculationAt: Date | null;
  
  // Stats
  totalParticipants: number;
  averageScore: number;
  medianScore: number;
  
  // Rankings
  rankings: LeaderboardEntry[];
  
  // User's position
  userRank: number | null;
  userEntry: LeaderboardEntry | null;
}

export interface UseCommunityDataResult {
  // Pool data
  pool: CommunityPoolData | null;
  poolLoading: boolean;
  poolError: Error | null;
  
  // User share data
  userShare: UserPoolShareData | null;
  userShareLoading: boolean;
  userShareError: Error | null;
  
  // Leaderboard data
  leaderboard: LeaderboardData | null;
  leaderboardLoading: boolean;
  leaderboardError: Error | null;
  
  // Actions
  refresh: () => void;
  setLeaderboardPeriodType: (type: 'weekly' | 'monthly' | 'all_time') => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get current pool period string (e.g., "2026-02")
 */
function getCurrentPoolPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get current week string (e.g., "2026-W06")
 */
function getCurrentWeekPeriod(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Calculate days remaining in period
 */
function calculateDaysRemaining(periodEnd: Timestamp | null): number {
  if (!periodEnd) return 0;
  const end = periodEnd.toDate();
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Anonymize display name for leaderboard
 */
function anonymizeName(displayName: string, rank: number): string {
  if (!displayName || displayName.length < 3) {
    return `Driver #${rank}`;
  }
  
  // Show first 3-5 chars, then asterisks
  const showChars = Math.min(5, Math.ceil(displayName.length * 0.4));
  const hidden = displayName.length - showChars;
  return displayName.substring(0, showChars) + '*'.repeat(Math.min(hidden, 3));
}

/**
 * Transform Firestore LeaderboardRanking to LeaderboardEntry
 */
function transformRanking(
  ranking: LeaderboardRanking,
  currentUserId: string | null
): LeaderboardEntry {
  const changeType = ranking.change > 0 ? 'up' : ranking.change < 0 ? 'down' : 'same';
  
  return {
    rank: ranking.rank,
    displayName: ranking.displayName,
    anonymizedName: anonymizeName(ranking.displayName, ranking.rank),
    score: Math.round(ranking.score),
    totalMiles: Math.round(ranking.totalMiles),
    totalTrips: ranking.totalTrips,
    change: ranking.change,
    changeType,
    isCurrentUser: ranking.userId === currentUserId,
  };
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

const DEFAULT_POOL_DATA: CommunityPoolData = {
  totalPoolCents: 0,
  totalPoolPounds: 0,
  totalContributionsCents: 0,
  totalPayoutsCents: 0,
  reserveCents: 0,
  activeParticipants: 0,
  totalParticipantsEver: 0,
  averagePoolScore: 0,
  safetyFactor: 1.0,
  claimsThisPeriod: 0,
  projectedRefundRate: 0,
  periodStart: null,
  periodEnd: null,
  periodType: 'monthly',
  daysRemaining: 0,
  lastCalculatedAt: null,
};

const DEFAULT_USER_SHARE: UserPoolShareData = {
  shareId: '',
  poolPeriod: '',
  contributionCents: 0,
  contributionPounds: 0,
  contributionCount: 0,
  sharePercentage: 0,
  weightedScore: 0,
  baseRefundCents: 0,
  projectedRefundCents: 0,
  projectedRefundPounds: 0,
  tripsIncluded: 0,
  milesIncluded: 0,
  averageScore: 0,
  status: 'active',
  eligibleForRefund: false,
};

const DEFAULT_LEADERBOARD: LeaderboardData = {
  period: '',
  periodType: 'weekly',
  calculatedAt: null,
  nextCalculationAt: null,
  totalParticipants: 0,
  averageScore: 0,
  medianScore: 0,
  rankings: [],
  userRank: null,
  userEntry: null,
};

// ============================================================================
// HOOK
// ============================================================================

export function useCommunityData(userId: string | null): UseCommunityDataResult {
  const onlineStatus = useContext(OnlineStatusContext);
  const reportFirestoreError = onlineStatus?.reportFirestoreError ?? (() => {});

  // Pool state — shared via usePoolState (no duplicate listener)
  const { pool: rawPool, loading: rawPoolLoading, error: rawPoolError, refresh: refreshPool } = usePoolState();

  const pool: CommunityPoolData | null = useMemo(() => {
    if (!rawPool) return rawPoolLoading ? null : DEFAULT_POOL_DATA;
    return {
      totalPoolCents: rawPool.totalPoolCents,
      totalPoolPounds: rawPool.totalPoolCents / 100,
      totalContributionsCents: rawPool.totalContributionsCents,
      totalPayoutsCents: rawPool.totalPayoutsCents,
      reserveCents: rawPool.reserveCents,
      activeParticipants: rawPool.activeParticipants,
      totalParticipantsEver: rawPool.totalParticipantsEver,
      averagePoolScore: rawPool.averagePoolScore,
      safetyFactor: rawPool.safetyFactor,
      claimsThisPeriod: rawPool.claimsThisPeriod,
      projectedRefundRate: rawPool.projectedRefundRate,
      periodStart: rawPool.periodStart?.toDate() || null,
      periodEnd: rawPool.periodEnd?.toDate() || null,
      periodType: rawPool.periodType,
      daysRemaining: calculateDaysRemaining(rawPool.periodEnd),
      lastCalculatedAt: rawPool.lastCalculatedAt?.toDate() || null,
    };
  }, [rawPool, rawPoolLoading]);
  const poolLoading = rawPoolLoading;
  const poolError = rawPoolError;

  // User share state
  const [userShare, setUserShare] = useState<UserPoolShareData | null>(null);
  const [userShareLoading, setUserShareLoading] = useState(true);
  const [userShareError, setUserShareError] = useState<Error | null>(null);
  
  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<Error | null>(null);
  const [leaderboardPeriodType, setLeaderboardPeriodType] = useState<'weekly' | 'monthly' | 'all_time'>('weekly');
  
  const [refreshKey, setRefreshKey] = useState(0);
  
  const refresh = useCallback(() => {
    refreshPool();
    setRefreshKey(k => k + 1);
  }, [refreshPool]);

  // Subscribe to user's pool share
  useEffect(() => {
    if (!userId || !isFirebaseConfigured || !db) {
      setUserShare(DEFAULT_USER_SHARE);
      setUserShareLoading(false);
      return;
    }

    setUserShareLoading(true);
    setUserShareError(null);

    const currentPeriod = getCurrentPoolPeriod();
    const shareId = `${currentPeriod}_${userId}`;
    const shareRef = doc(db, COLLECTION_NAMES.POOL_SHARES, shareId);
    
    const unsubscribe = onSnapshot(
      shareRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as PoolShareDocument;
          
          setUserShare({
            shareId: data.shareId,
            poolPeriod: data.poolPeriod,
            contributionCents: data.contributionCents,
            contributionPounds: data.contributionCents / 100,
            contributionCount: data.contributionCount,
            sharePercentage: data.sharePercentage,
            weightedScore: data.weightedScore,
            baseRefundCents: data.baseRefundCents,
            projectedRefundCents: data.projectedRefundCents,
            projectedRefundPounds: data.projectedRefundCents / 100,
            tripsIncluded: data.tripsIncluded,
            milesIncluded: data.milesIncluded,
            averageScore: data.averageScore,
            status: data.status,
            eligibleForRefund: data.eligibleForRefund,
          });
        } else {
          setUserShare(DEFAULT_USER_SHARE);
        }
        setUserShareLoading(false);
      },
      (err) => {
        console.error('[useCommunityData] User share subscription error:', err);
        reportFirestoreError();
        setUserShareError(err);
        setUserShareLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, refreshKey]);

  // Subscribe to leaderboard
  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      setLeaderboard(DEFAULT_LEADERBOARD);
      setLeaderboardLoading(false);
      return;
    }

    setLeaderboardLoading(true);
    setLeaderboardError(null);

    // Determine period based on type
    let period: string;
    switch (leaderboardPeriodType) {
      case 'weekly':
        period = getCurrentWeekPeriod();
        break;
      case 'monthly':
        period = getCurrentPoolPeriod();
        break;
      case 'all_time':
        period = 'all_time';
        break;
    }

    const leaderboardId = `${period}_${leaderboardPeriodType}`;
    const leaderboardRef = doc(db, COLLECTION_NAMES.LEADERBOARD, leaderboardId);
    
    const unsubscribe = onSnapshot(
      leaderboardRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as LeaderboardDocument;
          
          // Transform rankings
          const rankings = data.rankings.map(r => transformRanking(r, userId));
          
          // Find user's entry
          const userEntry = rankings.find(r => r.isCurrentUser) || null;
          const userRank = userEntry?.rank || null;
          
          setLeaderboard({
            period: data.period,
            periodType: data.periodType,
            calculatedAt: data.calculatedAt?.toDate() || null,
            nextCalculationAt: data.nextCalculationAt?.toDate() || null,
            totalParticipants: data.totalParticipants,
            averageScore: Math.round(data.averageScore * 10) / 10,
            medianScore: Math.round(data.medianScore * 10) / 10,
            rankings,
            userRank,
            userEntry,
          });
        } else {
          // No leaderboard data yet - create placeholder
          setLeaderboard({
            ...DEFAULT_LEADERBOARD,
            period,
            periodType: leaderboardPeriodType,
          });
        }
        setLeaderboardLoading(false);
      },
      (err) => {
        console.error('[useCommunityData] Leaderboard subscription error:', err);
        reportFirestoreError();
        setLeaderboardError(err);
        setLeaderboardLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, leaderboardPeriodType, refreshKey]);

  return {
    pool,
    poolLoading,
    poolError,
    userShare,
    userShareLoading,
    userShareError,
    leaderboard,
    leaderboardLoading,
    leaderboardError,
    refresh,
    setLeaderboardPeriodType,
  };
}

export default useCommunityData;
