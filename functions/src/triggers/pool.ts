/**
 * POOL SHARE TRIGGERS
 * ===================
 * Cloud Functions triggered by pool share document changes.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  COLLECTION_NAMES,
  PoolShareDocument,
  PoolShareSummary,
} from '../types';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';

const db = admin.firestore();

/**
 * Triggered when a pool share is created or updated
 * Syncs pool share summary to user document
 */
export const onPoolShareWrite = functions
  .region(EUROPE_LONDON)
  .firestore
  .document(`${COLLECTION_NAMES.POOL_SHARES}/{shareId}`)
  .onWrite(wrapTrigger(async (change, context) => {
    const shareId = context.params.shareId;
    
    // Handle deletion
    if (!change.after.exists) {
      functions.logger.info(`Pool share ${shareId} deleted`);
      return;
    }
    
    const share = change.after.data() as PoolShareDocument;
    
    // Only sync active shares from current period
    if (share.status !== 'active') {
      functions.logger.info(`Skipping sync for non-active share ${shareId}`);
      return;
    }
    
    functions.logger.info(`Pool share ${shareId} changed`, {
      userId: share.userId,
      contributionCents: share.contributionCents,
      projectedRefundCents: share.projectedRefundCents,
    });
    
    try {
      const userRef = db.collection(COLLECTION_NAMES.USERS).doc(share.userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        functions.logger.warn(`User ${share.userId} not found for share ${shareId}`);
        return;
      }
      
      // Build pool share summary (use share.updatedAt so denormalized lastUpdatedAt stays in sync)
      const poolShareSummary: PoolShareSummary = {
        currentShareCents: share.projectedRefundCents,
        contributionCents: share.contributionCents,
        sharePercentage: Math.round(share.sharePercentage * 10000) / 10000, // 4 decimal places — matches poolShares canonical precision
        lastUpdatedAt: share.updatedAt ?? admin.firestore.Timestamp.now(),
      };
      
      await userRef.update({
        poolShare: poolShareSummary,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'cloud-function',
      });
      
      functions.logger.info(`Synced pool share to user ${share.userId}`, {
        currentShareCents: poolShareSummary.currentShareCents,
        sharePercentage: poolShareSummary.sharePercentage,
      });
      
    } catch (error) {
      functions.logger.error(`Error syncing pool share ${shareId}:`, error);
      throw error;
    }
  }));
