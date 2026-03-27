/**
 * WATCHDOG FUNCTION
 * =================
 * Scheduled Cloud Function: runs every 60 minutes.
 * Monitors trip health: failed trip spikes, GPS drop-off, and stuck trips.
 *
 * Alerts are sent to Sentry and logged with [watchdog] metric tags
 * for Cloud Monitoring log-based alerting.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION_NAMES } from '../types';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger, captureError } from '../lib/sentry';

const db = admin.firestore();

const FAILED_TRIP_THRESHOLD = 5;
const STALE_HOURS = 24;

export const monitorTripHealth = functions
  .region(EUROPE_LONDON)
  .pubsub
  .schedule('every 60 minutes')
  .timeZone('Europe/London')
  .onRun(wrapTrigger(async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const staleThreshold = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000);

    // 1. Count failed trips in the last hour
    const failedTripsSnap = await db
      .collection(COLLECTION_NAMES.TRIPS)
      .where('status', '==', 'failed')
      .where('processedAt', '>=', admin.firestore.Timestamp.fromDate(oneHourAgo))
      .get();

    const failedCount = failedTripsSnap.size;

    if (failedCount >= FAILED_TRIP_THRESHOLD) {
      const msg = `ALERT: ${failedCount} failed trips in the last hour (threshold: ${FAILED_TRIP_THRESHOLD})`;
      functions.logger.error('[watchdog] failed_trips_spike', {
        metric: 'watchdog',
        alert: 'failed_trips_spike',
        failedCount,
        threshold: FAILED_TRIP_THRESHOLD,
      });
      captureError(msg, { failedCount, threshold: FAILED_TRIP_THRESHOLD });
    }

    // 2. Check for GPS upload drop-off (no new trips across all users for STALE_HOURS)
    const recentTripsSnap = await db
      .collection(COLLECTION_NAMES.TRIPS)
      .where('startedAt', '>=', admin.firestore.Timestamp.fromDate(staleThreshold))
      .limit(1)
      .get();

    if (recentTripsSnap.empty) {
      const msg = `WARNING: No new trips in the last ${STALE_HOURS} hours — possible GPS upload drop-off`;
      functions.logger.warn('[watchdog] no_recent_trips', {
        metric: 'watchdog',
        alert: 'no_recent_trips',
        staleHours: STALE_HOURS,
      });
      captureError(msg, { staleHours: STALE_HOURS });
    }

    // 3. Check for stuck trips (in 'processing' status for > 1 hour)
    const stuckTripsSnap = await db
      .collection(COLLECTION_NAMES.TRIPS)
      .where('status', '==', 'processing')
      .where('startedAt', '<=', admin.firestore.Timestamp.fromDate(oneHourAgo))
      .limit(10)
      .get();

    if (!stuckTripsSnap.empty) {
      const stuckIds = stuckTripsSnap.docs.map((d) => d.id);
      functions.logger.warn('[watchdog] stuck_trips', {
        metric: 'watchdog',
        alert: 'stuck_trips',
        count: stuckIds.length,
        tripIds: stuckIds,
      });
      captureError(`${stuckIds.length} trips stuck in processing for > 1 hour`, {
        tripIds: stuckIds,
      });
    }

    functions.logger.info('[watchdog] health check complete', {
      metric: 'watchdog',
      failedLastHour: failedCount,
      hasRecentTrips: !recentTripsSnap.empty,
      stuckTrips: stuckTripsSnap.size,
    });
  }));
