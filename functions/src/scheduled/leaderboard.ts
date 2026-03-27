/**
 * LEADERBOARD SCHEDULED FUNCTIONS
 * ===============================
 * Scheduled functions to update leaderboard rankings.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  COLLECTION_NAMES,
  UserDocument,
  LeaderboardDocument,
  LeaderboardRanking,
  LeaderboardPeriodType,
} from '../types';
import { getCurrentPeriodForType, getWeekNumber } from '../utils/helpers';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';

const db = admin.firestore();

// Maximum rankings to store
const MAX_RANKINGS = 100;

/**
 * Update all leaderboards every 15 minutes
 */
export const updateLeaderboards = functions
  .region(EUROPE_LONDON)
  .pubsub
  .schedule('every 15 minutes')
  .onRun(wrapTrigger(async (_context) => {
    functions.logger.info('Starting leaderboard update');
    
    try {
      await Promise.all([
        calculateLeaderboard('weekly'),
        calculateLeaderboard('monthly'),
        calculateLeaderboard('all_time'),
      ]);
      
      functions.logger.info('All leaderboards updated successfully');
    } catch (error) {
      functions.logger.error('Error updating leaderboards:', error);
      throw error;
    }
  }));

/**
 * Calculate and store leaderboard for a specific period type.
 *
 * Weekly/monthly boards only include users whose lastTripAt falls within the
 * current period. Tied scores receive the same rank (dense ranking).
 */
async function calculateLeaderboard(periodType: LeaderboardPeriodType): Promise<void> {
  const period = getCurrentPeriodForType(periodType);
  const leaderboardId = `${period}_${periodType}`;
  
  functions.logger.info(`Calculating ${periodType} leaderboard`, { leaderboardId });
  
  const usersRef = db.collection(COLLECTION_NAMES.USERS);
  
  const query = usersRef
    .where('drivingProfile.totalTrips', '>', 0)
    .orderBy('drivingProfile.totalTrips', 'desc')
    .orderBy('drivingProfile.currentScore', 'desc')
    .limit(MAX_RANKINGS * 3);
  
  const snapshot = await query.get();
  
  if (snapshot.empty) {
    functions.logger.info(`No users found for ${periodType} leaderboard`);
    return;
  }

  // Period date boundaries for weekly/monthly filtering
  const periodBounds = getPeriodBounds(periodType);
  
  // Get previous leaderboard for position changes
  const prevLeaderboard = await getPreviousLeaderboard(periodType);
  const prevRankings = new Map<string, number>();
  if (prevLeaderboard) {
    prevLeaderboard.rankings.forEach(r => prevRankings.set(r.userId, r.rank));
  }
  
  // Collect eligible users sorted by score (descending)
  const eligible: { user: UserDocument; docId: string }[] = [];

  for (const doc of snapshot.docs) {
    const user = doc.data() as UserDocument;
    
    if (!user.drivingProfile.currentScore || user.drivingProfile.totalTrips === 0) {
      continue;
    }

    // For weekly/monthly, only include users who drove within this period
    if (periodType !== 'all_time' && periodBounds) {
      const lastTrip = user.drivingProfile.lastTripAt;
      if (!lastTrip) continue;
      const lastTripMs = lastTrip.toMillis();
      if (lastTripMs < periodBounds.startMs || lastTripMs > periodBounds.endMs) {
        continue;
      }
    }

    eligible.push({ user, docId: doc.id });
  }

  // Sort by score descending (Firestore secondary sort may not be perfect)
  eligible.sort((a, b) => b.user.drivingProfile.currentScore - a.user.drivingProfile.currentScore);
  
  // Build rankings with dense ranking (tied scores = same rank)
  const rankings: LeaderboardRanking[] = [];
  const scores: number[] = [];
  let rank = 0;
  let prevScore = -1;
  
  for (const { user } of eligible) {
    const score = user.drivingProfile.currentScore;

    // Dense ranking: only increment rank when score differs
    if (score !== prevScore) {
      rank++;
      prevScore = score;
    }

    if (rankings.length >= MAX_RANKINGS) break;
    
    const prevRank = prevRankings.get(user.uid);
    const change = prevRank ? prevRank - rank : 0;
    
    rankings.push({
      rank,
      userId: user.uid,
      displayName: user.displayName || 'Anonymous',
      photoURL: user.photoURL,
      score,
      totalMiles: user.drivingProfile.totalMiles,
      totalTrips: user.drivingProfile.totalTrips,
      change,
    });
    
    scores.push(score);
  }
  
  // Calculate stats
  const totalParticipants = rankings.length;
  const averageScore = scores.length > 0 
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100
    : 0;
  const medianScore = scores.length > 0
    ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)]
    : 0;
  
  // Calculate next update time
  const now = admin.firestore.Timestamp.now();
  const nextUpdate = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + 15 * 60 * 1000 // 15 minutes
  );
  
  // Build leaderboard document
  const leaderboardData: LeaderboardDocument = {
    leaderboardId,
    period,
    periodType,
    rankings,
    totalParticipants,
    averageScore,
    medianScore,
    calculatedAt: now,
    nextCalculationAt: nextUpdate,
  };
  
  // Save to Firestore
  await db.collection(COLLECTION_NAMES.LEADERBOARD)
    .doc(leaderboardId)
    .set(leaderboardData);
  
  functions.logger.info(`Updated ${periodType} leaderboard`, {
    leaderboardId,
    participants: totalParticipants,
    averageScore,
  });
}

/**
 * Get previous leaderboard for comparison
 */
async function getPreviousLeaderboard(
  periodType: LeaderboardPeriodType
): Promise<LeaderboardDocument | null> {
  const prevPeriod = getPreviousPeriod(periodType);
  const prevLeaderboardId = `${prevPeriod}_${periodType}`;
  
  const doc = await db.collection(COLLECTION_NAMES.LEADERBOARD)
    .doc(prevLeaderboardId)
    .get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as LeaderboardDocument;
}

/**
 * Get start/end epoch milliseconds for the current period.
 * Returns null for all_time (no filtering needed).
 */
function getPeriodBounds(
  periodType: LeaderboardPeriodType
): { startMs: number; endMs: number } | null {
  if (periodType === 'all_time') return null;

  const now = new Date();

  if (periodType === 'weekly') {
    const dayOfWeek = now.getUTCDay() || 7; // Mon=1 ... Sun=7
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
    monday.setUTCHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);
    return { startMs: monday.getTime(), endMs: sunday.getTime() };
  }

  // monthly
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startMs: monthStart.getTime(), endMs: monthEnd.getTime() };
}

/**
 * Get previous period string
 */
function getPreviousPeriod(periodType: LeaderboardPeriodType): string {
  const now = new Date();
  
  switch (periodType) {
    case 'weekly':
      const prevWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekNum = getWeekNumber(prevWeekDate);
      return `${prevWeekDate.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    
    case 'monthly':
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    
    case 'all_time':
      return 'all_time'; // Same document, compare to self
    
    default:
      return getCurrentPeriodForType(periodType);
  }
}
