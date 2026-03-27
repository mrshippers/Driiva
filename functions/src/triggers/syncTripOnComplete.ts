/**
 * SYNC TRIP ON COMPLETE
 * =====================
 * Firestore trigger: when a trip's status becomes 'completed', write a summary row
 * to PostgreSQL trips_summary for API access.
 */

import * as functions from 'firebase-functions';
import { COLLECTION_NAMES, TripDocument } from '../types';
import { getPgUserIdByFirebaseUid, insertTripSummary } from '../lib/neon';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';

/**
 * Retry a function with exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      functions.logger.warn(`[sync] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`, { error: e });
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('unreachable');
}

export const syncTripOnComplete = functions
  .region(EUROPE_LONDON)
  .runWith({ secrets: ['DATABASE_URL'] })
  .firestore
  .document(`${COLLECTION_NAMES.TRIPS}/{tripId}`)
  .onUpdate(wrapTrigger(async (change, context) => {
    const before = change.before.data() as TripDocument;
    const after = change.after.data() as TripDocument;
    if (before.status === after.status || after.status !== 'completed') {
      return;
    }
    const tripId = context.params.tripId;
    const trip = after;
    try {
      const pgUserId = await getPgUserIdByFirebaseUid(trip.userId);
      if (pgUserId === null) {
        functions.logger.warn('No PostgreSQL user for Firebase uid, skipping trip sync', { tripId, firebaseUid: trip.userId });
        return;
      }
      const startedAt = trip.startedAt?.toDate?.() ?? new Date();
      const endedAt = trip.endedAt?.toDate?.() ?? new Date();
      const distanceKm = trip.distanceMeters / 1000;
      const events = trip.events ?? {
        hardBrakingCount: 0,
        hardAccelerationCount: 0,
        speedingSeconds: 0,
        sharpTurnCount: 0,
        phonePickupCount: 0,
      };
      await withRetry(() => insertTripSummary({
        userId: pgUserId,
        firestoreTripId: tripId,
        startedAt,
        endedAt,
        distanceKm,
        durationSeconds: trip.durationSeconds ?? 0,
        score: trip.score ?? 0,
        hardBrakingEvents: events.hardBrakingCount,
        harshAcceleration: events.hardAccelerationCount,
        speedViolations: Math.floor((events.speedingSeconds ?? 0) / 60),
        nightDriving: trip.context?.isNightDriving ?? false,
        sharpCorners: events.sharpTurnCount,
        startAddress: trip.startLocation?.address ?? null,
        endAddress: trip.endLocation?.address ?? null,
      }));
      functions.logger.info('Synced trip to PostgreSQL', { tripId, userId: trip.userId, pgUserId });
    } catch (error) {
      functions.logger.error('Failed to sync trip to PostgreSQL after retries', { tripId, error });
      throw error;
    }
  }));
