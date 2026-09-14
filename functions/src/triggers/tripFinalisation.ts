/**
 * Turning a trip's raw GPS points into its scored, finalised document, and the
 * paged read that gets the points. Extracted verbatim from
 * functions/src/triggers/trips.ts.
 */
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import * as Sentry from '@sentry/node';
import {
  COLLECTION_NAMES,
  TripDocument,
  TripPointsDocument,
  TripPoint,
} from '../types';
import {
  detectAnomalies,
  isNightTime,
  isRushHour,
} from '../utils/helpers';
import { computeTripMetrics } from '../scoring/tripMetrics';
import { getWeatherForTrip } from '../utils/weather';
import { db } from '../lib/db';
import { checkDpiaCompliance } from './tripSideEffects';

/**
 * Finalize trip by reading GPS points and computing metrics
 * 
 * Steps:
 * 1. Read all points from tripPoints/{tripId}
 * 2. Compute duration, distance (Haversine), average speed
 * 3. Compute driving score from events
 * 4. Update trip document with computed metrics
 * 5. Detect anomalies and set final status
 * 6. Update driver stats transactionally
 */
// Exported for the M2 emulator integration test (tests/integration/trips.test.ts),
// which drives the real completion path directly against the Firestore emulator
// without standing up the functions emulator. Mirrors the provisionUser export
// pattern M1 used for the same reason.
export async function finalizeTripFromPoints(
  tripId: string,
  tripData: TripDocument
): Promise<void> {
  const pipelineStartMs = Date.now();
  try {
    // 1. Read all GPS points
    const points = await readTripPoints(tripId);
    
    if (points.length < 2) {
      functions.logger.warn(`Trip ${tripId} has insufficient points (${points.length}), marking as failed`);
      await db.collection(COLLECTION_NAMES.TRIPS).doc(tripId).update({
        status: 'failed',
        processedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    
    functions.logger.info(`Processing ${points.length} GPS points for trip ${tripId}`);

    // 1b. DPIA compliance check (non-blocking)
    checkDpiaCompliance(tripId, points).catch((err) =>
      functions.logger.warn('DPIA check failed (non-blocking)', { tripId, err }),
    );
    
    // 2. Compute metrics from points. clientReportedPhonePickupCount is
    // untrusted client input (M2-DEC-1 Option A) - computeTripMetrics
    // sanitises and rate-caps it before it can influence the score; it is
    // passed straight through here, not trusted at this layer.
    const metrics = await Sentry.startSpan(
      { name: 'computeTripMetrics', op: 'trip.compute' },
      async () => computeTripMetrics(points, tripData.clientReportedPhonePickupCount),
    );

    functions.logger.info(`Computed metrics for trip ${tripId}:`, {
      distanceMeters: metrics.distanceMeters,
      durationSeconds: metrics.durationSeconds,
      avgSpeedMph: Math.round(metrics.avgSpeedMps * 2.237 * 100) / 100,
      score: metrics.score,
      phonePickupCount: metrics.events.phonePickupCount,
    });
    
    // 3. Detect anomalies
    const anomalies = detectAnomalies({
      distanceMeters: metrics.distanceMeters,
      durationSeconds: metrics.durationSeconds,
      startLocation: tripData.startLocation,
      endLocation: tripData.endLocation,
    });
    
    // 4. Calculate context (weather fetch is best-effort, 3s timeout)
    const weatherCondition = await Sentry.startSpan(
      { name: 'getWeatherForTrip', op: 'trip.weather' },
      async () => getWeatherForTrip(
        tripData.startLocation.lat,
        tripData.startLocation.lng,
        tripData.startedAt.toDate(),
      ),
    );
    const tripContext = {
      weatherCondition,
      isNightDriving: isNightTime(tripData.startedAt) || isNightTime(tripData.endedAt),
      isRushHour: isRushHour(tripData.startedAt),
    };
    
    // 5. Determine final status
    const finalStatus = anomalies.flaggedForReview ? 'processing' : 'completed';
    
    // 6. Update trip document with computed metrics
    //
    // The latency is read ONCE, here, and then both stored and logged. It is
    // measured to the point of the write rather than after it, so it excludes
    // the write itself; a second Date.now() for the log line would differ from
    // the stored number by however long Firestore took, and two surfaces would
    // then report one measurement differently with nothing to catch it.
    const pipelineLatencyMs = Date.now() - pipelineStartMs;
    const tripRef = db.collection(COLLECTION_NAMES.TRIPS).doc(tripId);
    await tripRef.update({
      // Computed metrics
      pipelineLatencyMs,
      distanceMeters: metrics.distanceMeters,
      durationSeconds: metrics.durationSeconds,
      score: metrics.score,
      scoreBreakdown: metrics.scoreBreakdown,
      events: metrics.events,
      
      // Enrichment
      anomalies,
      context: tripContext,
      
      // Status
      status: finalStatus,
      processedAt: finalStatus === 'completed' ? FieldValue.serverTimestamp() : null,
    });
    
    functions.logger.info(`Trip ${tripId} finalized with status: ${finalStatus}`, {
      flaggedForReview: anomalies.flaggedForReview,
    });
    
    // 7. Profile, achievements, classification and AI are NOT triggered here.
    // Write B above flips status processing -> completed, which re-triggers
    // onTripStatusChange CASE 2. CASE 2 is the SOLE caller of
    // updateDriverProfileAndPoolShare + checkAchievementsAsync (and the
    // classification/AI wrappers) on every completion. Calling the profile and
    // achievements directly here as well was the double-fire: one real
    // completion scored the driver profile twice (totalTrips/totalMiles/streak
    // double-counted). CASE 2 fires reliably off that same write, so removing
    // the direct call fixes the double-count without dropping the update.

    functions.logger.info('[metric] trip_pipeline', {
      metric: 'trip_pipeline',
      tripId,
      success: true,
      latencyMs: pipelineLatencyMs,
      pointCount: points.length,
      distanceMeters: metrics.distanceMeters,
      durationSeconds: metrics.durationSeconds,
      score: metrics.score,
      finalStatus,
      flaggedForReview: anomalies.flaggedForReview,
    });

  } catch (error) {
    functions.logger.error(`Error finalizing trip ${tripId}:`, error);
    
    // Mark trip as failed
    await db.collection(COLLECTION_NAMES.TRIPS).doc(tripId).update({
      status: 'failed',
      processedAt: FieldValue.serverTimestamp(),
    });
    
    throw error;
  }
}

/**
 * Read all GPS points for a trip
 * Handles both single-document and batched storage
 */
export async function readTripPoints(tripId: string): Promise<TripPoint[]> {
  const pointsRef = db.collection(COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
  const snapshot = await pointsRef.get();
  
  if (!snapshot.exists) {
    functions.logger.warn(`No trip points document found for trip ${tripId}`);
    return [];
  }
  
  const data = snapshot.data() as TripPointsDocument;
  
  // If points are in the main document
  if (data.points && data.points.length > 0) {
    return data.points;
  }
  
  // Otherwise, fetch from batches subcollection
  const batchesSnapshot = await pointsRef
    .collection('batches')
    .orderBy('batchIndex')
    .get();
  
  const allPoints: TripPoint[] = [];
  batchesSnapshot.docs.forEach(doc => {
    const batch = doc.data();
    if (batch.points && Array.isArray(batch.points)) {
      allPoints.push(...batch.points);
    }
  });
  
  return allPoints;
}
