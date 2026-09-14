/**
 * TRIP TRIGGERS
 * =============
 * Cloud Functions triggered by trip document changes.
 */

import * as functions from 'firebase-functions/v1';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getWeatherForTrip } from '../utils/weather';
import {
  COLLECTION_NAMES,
  TripDocument,
  TripPoint,
  UserDocument,
} from '../types';
import {
  detectAnomalies,
  isNightTime,
  isRushHour,
} from '../utils/helpers';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';
import { db } from '../lib/db';
import {
  analyzeCompletedTripAsync,
  checkAchievementsAsync,
  classifyCompletedTripAsync,
} from './tripSideEffects';
import { finalizeTripFromPoints } from './tripFinalisation';
import { updateDriverProfileAndPoolShare } from './driverProfile';

// The two helpers below were declared here before this file was split; they
// stay part of this module's public surface.
export { finalizeTripFromPoints } from './tripFinalisation';
export { updateDriverProfileAndPoolShare } from './driverProfile';


/**
 * Triggered when a new trip is created
 * - Detects anomalies
 * - Enriches with context (night driving, rush hour)
 * - Updates trip status
 */
export const onTripCreate = functions
  .region(EUROPE_LONDON)
  .runWith({ minInstances: 1 })
  .firestore
  .document(`${COLLECTION_NAMES.TRIPS}/{tripId}`)
  .onCreate(wrapTrigger(async (snap, context) => {
    const tripId = context.params.tripId;
    const trip = snap.data() as TripDocument;
    
    functions.logger.info(`Processing new trip: ${tripId}`, { userId: trip.userId, status: trip.status });

    // Trips created with status='recording' are in-progress on the client.
    // The client transitions recording→processing when the trip ends, which
    // triggers onTripStatusChange to compute metrics from GPS points.
    // Do NOT change status here - distanceMeters/durationSeconds are 0 at
    // creation time and anomaly detection on zero values produces false results.
    if (trip.status === 'recording') {
      functions.logger.info(`Trip ${tripId} is recording; awaiting client status transition`);
      return;
    }

    try {
      // 1. Detect anomalies (only valid for trips with pre-computed metrics)
      const anomalies = detectAnomalies({
        distanceMeters: trip.distanceMeters,
        durationSeconds: trip.durationSeconds,
        startLocation: trip.startLocation,
        endLocation: trip.endLocation,
      });

      // 2. Calculate context (weather fetch is best-effort, 3s timeout)
      const weatherCondition = await getWeatherForTrip(
        trip.startLocation.lat,
        trip.startLocation.lng,
        trip.startedAt.toDate(),
      );
      const tripContext = {
        weatherCondition,
        isNightDriving: isNightTime(trip.startedAt) || isNightTime(trip.endedAt),
        isRushHour: isRushHour(trip.startedAt),
      };

      // 3. Determine status
      const newStatus = anomalies.flaggedForReview ? 'processing' : 'completed';

      // 4. Update trip document
      await snap.ref.update({
        anomalies,
        context: tripContext,
        status: newStatus,
        processedAt: newStatus === 'completed' ? FieldValue.serverTimestamp() : null,
      });

      functions.logger.info(`Trip ${tripId} processed`, {
        status: newStatus,
        flagged: anomalies.flaggedForReview
      });

      // 5. If trip is completed (no anomalies), trigger profile update + achievements
      if (newStatus === 'completed') {
        await updateDriverProfileAndPoolShare(trip, tripId);
        checkAchievementsAsync(trip.userId, trip, tripId);
      }

    } catch (error) {
      functions.logger.error(`Error processing trip ${tripId}:`, error);

      // Mark trip as failed
      await snap.ref.update({
        status: 'failed',
        processedAt: FieldValue.serverTimestamp(),
      });

      throw error;
    }
  }));

/**
 * Triggered when trip status changes
 * Handles:
 * 1. Trip finalization (recording → processing): Compute metrics from GPS points
 * 2. Manual review completion (processing → completed): Update driver profile
 */
export const onTripStatusChange = functions
  .region(EUROPE_LONDON)
  .runWith({ minInstances: 1 })
  .firestore
  .document(`${COLLECTION_NAMES.TRIPS}/{tripId}`)
  .onUpdate(wrapTrigger(async (change, context) => {
    const tripId = context.params.tripId;
    const before = change.before.data() as TripDocument;
    const after = change.after.data() as TripDocument;
    
    // Skip if status hasn't changed
    if (before.status === after.status) {
      return;
    }
    
    functions.logger.info(`Trip ${tripId} status change: ${before.status} → ${after.status}`);
    
    // -------------------------------------------------------------------------
    // CASE 1: Trip ended (recording → processing)
    // Finalize trip by computing metrics from GPS points
    // -------------------------------------------------------------------------
    if (before.status === 'recording' && after.status === 'processing') {
      functions.logger.info(`Trip ${tripId} ended, computing metrics from GPS points`);
      await finalizeTripFromPoints(tripId, after);
      return;
    }
    
    // -------------------------------------------------------------------------
    // CASE 2: Manual review completion (processing → completed)
    // Update driver profile and pool share
    // -------------------------------------------------------------------------
    if (before.status === 'processing' && after.status === 'completed') {
      functions.logger.info(`Trip ${tripId} manually approved, updating profile`);
      
      // Set processedAt timestamp if not already set
      if (!after.processedAt) {
        const tripRef = getFirestore().collection(COLLECTION_NAMES.TRIPS).doc(tripId);
        await tripRef.update({
          processedAt: FieldValue.serverTimestamp(),
        });
        functions.logger.info(`Set processedAt timestamp for trip ${tripId}`);
      }
      
      await updateDriverProfileAndPoolShare(after, tripId);
      checkAchievementsAsync(after.userId, after, tripId);
      
      // Trigger intelligent trip segmentation (async, non-blocking)
      classifyCompletedTripAsync(tripId, after);
      
      // Trigger AI analysis (async, non-blocking)
      try {
        const userDoc = await db.collection(COLLECTION_NAMES.USERS).doc(after.userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data() as UserDocument;
          // Read GPS points for AI analysis
          const pointsRef = db.collection(COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
          const pointsSnap = await pointsRef.get();
          const pointsData = pointsSnap.exists ? (pointsSnap.data()?.points || []) as TripPoint[] : [];
          analyzeCompletedTripAsync(tripId, after, pointsData, userData.drivingProfile);
        }
      } catch (aiSetupErr) {
        functions.logger.warn(`[AI] Failed to setup AI analysis for trip ${tripId}:`, aiSetupErr);
      }
    }
  }));

