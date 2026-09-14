"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeTripFromPoints = finalizeTripFromPoints;
exports.readTripPoints = readTripPoints;
/**
 * Turning a trip's raw GPS points into its scored, finalised document, and the
 * paged read that gets the points. Extracted verbatim from
 * functions/src/triggers/trips.ts.
 */
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const Sentry = __importStar(require("@sentry/node"));
const types_1 = require("../types");
const helpers_1 = require("../utils/helpers");
const tripMetrics_1 = require("../scoring/tripMetrics");
const weather_1 = require("../utils/weather");
const db_1 = require("../lib/db");
const tripSideEffects_1 = require("./tripSideEffects");
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
async function finalizeTripFromPoints(tripId, tripData) {
    const pipelineStartMs = Date.now();
    try {
        // 1. Read all GPS points
        const points = await readTripPoints(tripId);
        if (points.length < 2) {
            functions.logger.warn(`Trip ${tripId} has insufficient points (${points.length}), marking as failed`);
            await db_1.db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId).update({
                status: 'failed',
                processedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return;
        }
        functions.logger.info(`Processing ${points.length} GPS points for trip ${tripId}`);
        // 1b. DPIA compliance check (non-blocking)
        (0, tripSideEffects_1.checkDpiaCompliance)(tripId, points).catch((err) => functions.logger.warn('DPIA check failed (non-blocking)', { tripId, err }));
        // 2. Compute metrics from points. clientReportedPhonePickupCount is
        // untrusted client input (M2-DEC-1 Option A) - computeTripMetrics
        // sanitises and rate-caps it before it can influence the score; it is
        // passed straight through here, not trusted at this layer.
        const metrics = await Sentry.startSpan({ name: 'computeTripMetrics', op: 'trip.compute' }, async () => (0, tripMetrics_1.computeTripMetrics)(points, tripData.clientReportedPhonePickupCount));
        functions.logger.info(`Computed metrics for trip ${tripId}:`, {
            distanceMeters: metrics.distanceMeters,
            durationSeconds: metrics.durationSeconds,
            avgSpeedMph: Math.round(metrics.avgSpeedMps * 2.237 * 100) / 100,
            score: metrics.score,
            phonePickupCount: metrics.events.phonePickupCount,
        });
        // 3. Detect anomalies
        const anomalies = (0, helpers_1.detectAnomalies)({
            distanceMeters: metrics.distanceMeters,
            durationSeconds: metrics.durationSeconds,
            startLocation: tripData.startLocation,
            endLocation: tripData.endLocation,
        });
        // 4. Calculate context (weather fetch is best-effort, 3s timeout)
        const weatherCondition = await Sentry.startSpan({ name: 'getWeatherForTrip', op: 'trip.weather' }, async () => (0, weather_1.getWeatherForTrip)(tripData.startLocation.lat, tripData.startLocation.lng, tripData.startedAt.toDate()));
        const tripContext = {
            weatherCondition,
            isNightDriving: (0, helpers_1.isNightTime)(tripData.startedAt) || (0, helpers_1.isNightTime)(tripData.endedAt),
            isRushHour: (0, helpers_1.isRushHour)(tripData.startedAt),
        };
        // 5. Determine final status
        const finalStatus = anomalies.flaggedForReview ? 'processing' : 'completed';
        // 6. Update trip document with computed metrics
        const tripRef = db_1.db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId);
        await tripRef.update({
            // Computed metrics
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
            processedAt: finalStatus === 'completed' ? firestore_1.FieldValue.serverTimestamp() : null,
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
            latencyMs: Date.now() - pipelineStartMs,
            pointCount: points.length,
            distanceMeters: metrics.distanceMeters,
            durationSeconds: metrics.durationSeconds,
            score: metrics.score,
            finalStatus,
            flaggedForReview: anomalies.flaggedForReview,
        });
    }
    catch (error) {
        functions.logger.error(`Error finalizing trip ${tripId}:`, error);
        // Mark trip as failed
        await db_1.db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId).update({
            status: 'failed',
            processedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        throw error;
    }
}
/**
 * Read all GPS points for a trip
 * Handles both single-document and batched storage
 */
async function readTripPoints(tripId) {
    const pointsRef = db_1.db.collection(types_1.COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
    const snapshot = await pointsRef.get();
    if (!snapshot.exists) {
        functions.logger.warn(`No trip points document found for trip ${tripId}`);
        return [];
    }
    const data = snapshot.data();
    // If points are in the main document
    if (data.points && data.points.length > 0) {
        return data.points;
    }
    // Otherwise, fetch from batches subcollection
    const batchesSnapshot = await pointsRef
        .collection('batches')
        .orderBy('batchIndex')
        .get();
    const allPoints = [];
    batchesSnapshot.docs.forEach(doc => {
        const batch = doc.data();
        if (batch.points && Array.isArray(batch.points)) {
            allPoints.push(...batch.points);
        }
    });
    return allPoints;
}
//# sourceMappingURL=tripFinalisation.js.map