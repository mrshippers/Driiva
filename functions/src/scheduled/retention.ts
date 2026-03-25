/**
 * DATA RETENTION FUNCTION
 * =======================
 * Scheduled Cloud Function: runs daily at 3 AM London time.
 * Enforces the 90-day data retention policy on tripPoints.
 *
 * Deletes tripPoints documents where `expiresAt <= now`, including
 * any `batches` subcollection docs. Metrics logged with [retention] tag
 * for Cloud Monitoring log-based alerting.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION_NAMES } from '../types';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';

const db = admin.firestore();

const BATCH_SIZE = 500;

export const enforceDataRetention = functions
  .region(EUROPE_LONDON)
  .pubsub
  .schedule('every day 03:00')
  .timeZone('Europe/London')
  .onRun(wrapTrigger(async () => {
    const now = admin.firestore.Timestamp.now();
    let totalDeleted = 0;

    functions.logger.info('[retention] Starting data retention sweep', {
      metric: 'retention',
      expiresAtThreshold: now.toDate().toISOString(),
    });

    // Loop until all expired docs are deleted
    let hasMore = true;

    while (hasMore) {
      const expiredSnap = await db
        .collection(COLLECTION_NAMES.TRIP_POINTS)
        .where('expiresAt', '<=', now)
        .limit(BATCH_SIZE)
        .get();

      if (expiredSnap.empty) {
        hasMore = false;
        break;
      }

      const batch = db.batch();
      let batchCount = 0;

      for (const doc of expiredSnap.docs) {
        // Delete any batches subcollection docs
        const batchesSnap = await db
          .collection(COLLECTION_NAMES.TRIP_POINTS)
          .doc(doc.id)
          .collection('batches')
          .get();

        for (const batchDoc of batchesSnap.docs) {
          batch.delete(batchDoc.ref);
          batchCount++;
        }

        // Delete the tripPoints document itself
        batch.delete(doc.ref);
        batchCount++;
      }

      await batch.commit();
      totalDeleted += batchCount;

      functions.logger.info('[retention] Batch deleted', {
        metric: 'retention',
        batchSize: batchCount,
        totalDeletedSoFar: totalDeleted,
      });

      // If we got fewer than BATCH_SIZE, we're done
      if (expiredSnap.size < BATCH_SIZE) {
        hasMore = false;
      }
    }

    if (totalDeleted === 0) {
      functions.logger.info('[retention] No expired tripPoints found — nothing to delete', {
        metric: 'retention',
        deletedCount: 0,
      });
    } else {
      functions.logger.info('[retention] Data retention sweep complete', {
        metric: 'retention',
        deletedCount: totalDeleted,
      });
    }
  }));
