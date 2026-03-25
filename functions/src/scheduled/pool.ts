/**
 * POOL SCHEDULED FUNCTIONS
 * ========================
 * Scheduled functions for community pool management.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  COLLECTION_NAMES,
  CommunityPoolDocument,
  PoolShareDocument,
} from '../types';
import {
  getPreviousPoolPeriod,
  getCurrentPoolPeriod,
  calculateProjectedRefund,
} from '../utils/helpers';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';

const db = admin.firestore();

/**
 * Finalize pool period on the 1st of each month
 * - Mark all shares as finalized
 * - Calculate final refund amounts
 * - Prepare for payout
 */
export const finalizePoolPeriod = functions
  .region(EUROPE_LONDON)
  .pubsub
  .schedule('0 0 1 * *') // 1st of each month at midnight UTC
  .timeZone('America/New_York')
  .onRun(wrapTrigger(async (_context) => {
    const previousPeriod = getPreviousPoolPeriod();
    
    functions.logger.info(`Finalizing pool period: ${previousPeriod}`);
    
    try {
      // Get pool state
      const poolRef = db.collection(COLLECTION_NAMES.COMMUNITY_POOL).doc('current');
      const poolDoc = await poolRef.get();
      
      if (!poolDoc.exists) {
        functions.logger.error('Community pool not found');
        return;
      }
      
      const pool = poolDoc.data() as CommunityPoolDocument;
      
      // Get all active shares for the previous period
      const sharesRef = db.collection(COLLECTION_NAMES.POOL_SHARES);
      const sharesQuery = sharesRef
        .where('poolPeriod', '==', previousPeriod)
        .where('status', '==', 'active');
      
      const sharesSnapshot = await sharesQuery.get();
      
      if (sharesSnapshot.empty) {
        functions.logger.info(`No active shares found for period ${previousPeriod}`);
        return;
      }
      
      // Calculate total weighted scores for distribution
      let totalWeightedScore = 0;
      const shares: PoolShareDocument[] = [];
      
      sharesSnapshot.docs.forEach(doc => {
        const share = doc.data() as PoolShareDocument;
        shares.push(share);
        totalWeightedScore += share.weightedScore;
      });
      
      // Calculate available refund pool (after reserve) — integer math to avoid float errors
      const reserveBps = 1000; // 10% = 1000 bps
      const availablePoolCents = Math.round(pool.totalPoolCents * (10000 - reserveBps) / 10000);
      const refundRateBps = Math.round(pool.projectedRefundRate * 10000);
      const refundPool = Math.round(availablePoolCents * refundRateBps / 10000);
      
      // Batch update all shares
      const batch = db.batch();
      const now = admin.firestore.Timestamp.now();
      
      for (const share of shares) {
        if (!share.eligibleForRefund) {
          // Not eligible (filed claims)
          batch.update(
            sharesRef.doc(share.shareId),
            {
              status: 'finalized',
              baseRefundCents: 0,
              projectedRefundCents: 0,
              finalizedAt: now,
              updatedAt: now,
            }
          );
          continue;
        }
        
        // Calculate proportional refund based on weighted score
        const shareOfPool = totalWeightedScore > 0 
          ? share.weightedScore / totalWeightedScore 
          : 0;
        const refundAmount = Math.round(refundPool * shareOfPool);
        
        // Also calculate based on individual score
        const scoreBasedRefund = calculateProjectedRefund(
          share.averageScore,
          share.contributionCents,
          pool.safetyFactor,
          pool.projectedRefundRate
        );
        
        // Use the smaller of the two (conservative approach)
        const finalRefund = Math.min(refundAmount, scoreBasedRefund);
        
        batch.update(
          sharesRef.doc(share.shareId),
          {
            status: 'finalized',
            baseRefundCents: refundAmount,
            projectedRefundCents: finalRefund,
            finalizedAt: now,
            updatedAt: now,
          }
        );
        
        functions.logger.info(`Finalized share ${share.shareId}`, {
          userId: share.userId,
          contributionCents: share.contributionCents,
          refundCents: finalRefund,
          averageScore: share.averageScore,
        });
      }
      
      // Update pool document for new period
      const { start, end } = getPoolPeriodDates('monthly');
      
      batch.update(poolRef, {
        periodStart: start,
        periodEnd: end,
        claimsThisPeriod: 0,
        lastCalculatedAt: now,
        version: admin.firestore.FieldValue.increment(1),
      });
      
      await batch.commit();
      
      functions.logger.info(`Pool period ${previousPeriod} finalized`, {
        sharesProcessed: shares.length,
        refundPoolCents: Math.round(refundPool),
      });
      
    } catch (error) {
      functions.logger.error(`Error finalizing pool period ${previousPeriod}:`, error);
      throw error;
    }
  }));

/**
 * Recalculate pool share projections daily
 * Updates projected refund amounts based on current pool state
 */
export const recalculatePoolShares = functions
  .region(EUROPE_LONDON)
  .pubsub
  .schedule('0 6 * * *') // Daily at 6 AM UTC
  .timeZone('America/New_York')
  .onRun(wrapTrigger(async (_context) => {
    const currentPeriod = getCurrentPoolPeriod();
    
    functions.logger.info(`Recalculating pool shares for period: ${currentPeriod}`);
    
    try {
      // Get pool state
      const poolRef = db.collection(COLLECTION_NAMES.COMMUNITY_POOL).doc('current');
      const poolDoc = await poolRef.get();
      
      if (!poolDoc.exists) {
        functions.logger.error('Community pool not found');
        return;
      }
      
      const pool = poolDoc.data() as CommunityPoolDocument;
      
      // Get all active shares for current period
      const sharesRef = db.collection(COLLECTION_NAMES.POOL_SHARES);
      const sharesQuery = sharesRef
        .where('poolPeriod', '==', currentPeriod)
        .where('status', '==', 'active');
      
      const sharesSnapshot = await sharesQuery.get();
      
      if (sharesSnapshot.empty) {
        functions.logger.info(`No active shares found for period ${currentPeriod}`);
        return;
      }
      
      // Calculate total contributions for percentage
      let totalContributions = 0;
      let totalWeightedScore = 0;
      const shares: PoolShareDocument[] = [];
      
      sharesSnapshot.docs.forEach(doc => {
        const share = doc.data() as PoolShareDocument;
        shares.push(share);
        totalContributions += share.contributionCents;
        totalWeightedScore += share.weightedScore;
      });
      
      // Update pool average score
      const avgScore = shares.length > 0
        ? shares.reduce((sum, s) => sum + s.averageScore * s.contributionCents, 0) / totalContributions
        : 100;
      
      // Batch update all shares
      const batch = db.batch();
      const now = admin.firestore.Timestamp.now();
      
      for (const share of shares) {
        // Recalculate share percentage
        const sharePercentage = totalContributions > 0
          ? (share.contributionCents / totalContributions) * 100
          : 0;
        
        // Calculate projected refund
        const projectedRefund = share.eligibleForRefund
          ? calculateProjectedRefund(
              share.averageScore,
              share.contributionCents,
              pool.safetyFactor,
              pool.projectedRefundRate
            )
          : 0;
        
        batch.update(
          sharesRef.doc(share.shareId),
          {
            sharePercentage: Math.round(sharePercentage * 10000) / 10000,
            projectedRefundCents: projectedRefund,
            updatedAt: now,
          }
        );
      }
      
      // Update pool stats
      batch.update(poolRef, {
        activeParticipants: shares.length,
        averagePoolScore: Math.round(avgScore * 100) / 100,
        lastCalculatedAt: now,
        version: admin.firestore.FieldValue.increment(1),
      });
      
      await batch.commit();
      
      functions.logger.info(`Pool shares recalculated for period ${currentPeriod}`, {
        sharesUpdated: shares.length,
        totalContributionsCents: totalContributions,
        averageScore: Math.round(avgScore * 100) / 100,
      });
      
    } catch (error) {
      functions.logger.error(`Error recalculating pool shares:`, error);
      throw error;
    }
  }));

/**
 * Get pool period date range
 */
function getPoolPeriodDates(periodType: 'monthly' | 'quarterly'): {
  start: admin.firestore.Timestamp;
  end: admin.firestore.Timestamp;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  let startDate: Date;
  let endDate: Date;
  
  if (periodType === 'monthly') {
    startDate = new Date(year, month, 1);
    endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
  } else {
    const quarter = Math.floor(month / 3);
    startDate = new Date(year, quarter * 3, 1);
    endDate = new Date(year, (quarter + 1) * 3, 0, 23, 59, 59, 999);
  }
  
  return {
    start: admin.firestore.Timestamp.fromDate(startDate),
    end: admin.firestore.Timestamp.fromDate(endDate),
  };
}
