"use strict";
/**
 * TRIP TRIGGERS
 * =============
 * Cloud Functions triggered by trip document changes.
 */
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
exports.onTripStatusChange = exports.onTripCreate = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const helpers_1 = require("../utils/helpers");
const weather_1 = require("../utils/weather");
const achievements_1 = require("../utils/achievements");
const notifications_1 = require("../utils/notifications");
const classifier_1 = require("../http/classifier");
const tripAnalysis_1 = require("../ai/tripAnalysis");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const Sentry = __importStar(require("@sentry/node"));
const db = admin.firestore();
// ─── DPIA SAFEGUARD ─────────────────────────────────────────────────────────
// Approved data fields for trip point processing. Any new field types added to
// tripPoints documents that aren't in this list will trigger a warning log and
// a Firestore flag at admin/dpiaAlerts. This is an architectural safeguard for
// future GDPR compliance — trips still process normally.
//
// Before adding new sensor types to trip collection, a Data Protection Impact
// Assessment (DPIA) must be completed per UK GDPR Art. 35 for high-risk
// processing of location/behavioural data at scale.
const DPIA_REVIEWED_DATA_TYPES = new Set([
    't', 'lat', 'lng', 'spd', 'hdg', 'acc', // Core GPS fields
    'ax', 'ay', 'az', // Accelerometer
    'gx', 'gy', 'gz', // Gyroscope
]);
/**
 * Non-blocking check: flag any unreviewed data types in trip points.
 * Writes an alert to admin/dpiaAlerts if new fields are detected.
 */
async function checkDpiaCompliance(tripId, points) {
    if (!points.length)
        return;
    const sample = points[0];
    const unreviewedFields = Object.keys(sample).filter((key) => !DPIA_REVIEWED_DATA_TYPES.has(key));
    if (unreviewedFields.length > 0) {
        functions.logger.warn('DPIA REVIEW REQUIRED: new data type detected in trip points', {
            tripId,
            fields: unreviewedFields,
        });
        try {
            const alertRef = db.collection('admin').doc('dpiaAlerts');
            await alertRef.set({
                lastAlertAt: admin.firestore.FieldValue.serverTimestamp(),
                unreviewedFields: admin.firestore.FieldValue.arrayUnion(...unreviewedFields),
                [`alerts.${tripId}`]: {
                    fields: unreviewedFields,
                    detectedAt: new Date().toISOString(),
                },
            }, { merge: true });
        }
        catch (err) {
            functions.logger.error('Failed to write DPIA alert', { tripId, err });
        }
    }
}
/**
 * Async wrapper for trip classification
 *
 * Calls the Stop-Go-Classifier Python function without blocking trip processing.
 * Classification is an enhancement, not critical to trip completion.
 */
function classifyCompletedTripAsync(tripId, trip) {
    // Fire and forget - don't await
    (0, classifier_1.classifyCompletedTrip)(tripId, trip)
        .catch(error => {
        functions.logger.warn(`Non-blocking classification error for trip ${tripId}:`, error);
    });
}
/**
 * Check whether AI insights feature flag is enabled.
 *
 * Set via environment variable FEATURE_AI_INSIGHTS (default: "true").
 * Disable by setting it to "false" in Cloud Functions config / .env.
 */
function isAIInsightsEnabled() {
    const flag = process.env.FEATURE_AI_INSIGHTS ?? 'true';
    return flag.toLowerCase() === 'true';
}
/**
 * Async wrapper for AI trip analysis
 *
 * Calls Claude Sonnet 4 to generate advanced driving insights.
 * Non-blocking: the driver sees the algorithmic score immediately,
 * and AI insights are layered on asynchronously (typically < 5 s).
 *
 * Gated by the FEATURE_AI_INSIGHTS environment variable.
 */
function analyzeCompletedTripAsync(tripId, trip, points, profile) {
    if (!isAIInsightsEnabled()) {
        functions.logger.info(`[AI] Feature flag disabled, skipping analysis for trip ${tripId}`);
        return;
    }
    (0, tripAnalysis_1.analyzeTrip)(tripId, trip, points, profile)
        .then(result => {
        if (result) {
            functions.logger.info(`[AI] Trip ${tripId} analysis completed`);
        }
    })
        .catch(error => {
        functions.logger.warn(`Non-blocking AI analysis error for trip ${tripId}:`, error);
    });
}
/**
 * Async wrapper for achievement checking + push notifications.
 * Non-blocking: these are enhancements, not critical to trip completion.
 */
function checkAchievementsAsync(userId, trip, tripId) {
    (async () => {
        try {
            // Send trip-complete push notification
            (0, notifications_1.notifyTripComplete)(userId, tripId, trip.score).catch(err => functions.logger.warn(`[Push] Trip-complete notification error:`, err));
            // Check & unlock achievements
            const userDoc = await db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).get();
            if (!userDoc.exists)
                return;
            const profile = userDoc.data().drivingProfile;
            const unlocked = await (0, achievements_1.checkAndUnlockAchievements)(userId, profile, trip, tripId);
            if (unlocked.length > 0) {
                functions.logger.info(`[Achievements] Unlocked ${unlocked.length} for user ${userId}: ${unlocked.join(', ')}`);
                const names = unlocked
                    .map(id => achievements_1.ACHIEVEMENT_DEFINITIONS.find(d => d.id === id)?.name)
                    .filter(Boolean);
                (0, notifications_1.notifyAchievementsUnlocked)(userId, names).catch(err => functions.logger.warn(`[Push] Achievement notification error:`, err));
            }
        }
        catch (err) {
            functions.logger.warn(`[Achievements] Non-blocking error for user ${userId}:`, err);
        }
    })();
}
/**
 * Triggered when a new trip is created
 * - Detects anomalies
 * - Enriches with context (night driving, rush hour)
 * - Updates trip status
 */
exports.onTripCreate = functions
    .region(region_1.EUROPE_LONDON)
    .runWith({ minInstances: 1 })
    .firestore
    .document(`${types_1.COLLECTION_NAMES.TRIPS}/{tripId}`)
    .onCreate((0, sentry_1.wrapTrigger)(async (snap, context) => {
    const tripId = context.params.tripId;
    const trip = snap.data();
    functions.logger.info(`Processing new trip: ${tripId}`, { userId: trip.userId, status: trip.status });
    // Trips created with status='recording' are in-progress on the client.
    // The client transitions recording→processing when the trip ends, which
    // triggers onTripStatusChange to compute metrics from GPS points.
    // Do NOT change status here — distanceMeters/durationSeconds are 0 at
    // creation time and anomaly detection on zero values produces false results.
    if (trip.status === 'recording') {
        functions.logger.info(`Trip ${tripId} is recording; awaiting client status transition`);
        return;
    }
    try {
        // 1. Detect anomalies (only valid for trips with pre-computed metrics)
        const anomalies = (0, helpers_1.detectAnomalies)({
            distanceMeters: trip.distanceMeters,
            durationSeconds: trip.durationSeconds,
            startLocation: trip.startLocation,
            endLocation: trip.endLocation,
        });
        // 2. Calculate context (weather fetch is best-effort, 3s timeout)
        const weatherCondition = await (0, weather_1.getWeatherForTrip)(trip.startLocation.lat, trip.startLocation.lng, trip.startedAt.toDate());
        const tripContext = {
            weatherCondition,
            isNightDriving: (0, helpers_1.isNightTime)(trip.startedAt) || (0, helpers_1.isNightTime)(trip.endedAt),
            isRushHour: (0, helpers_1.isRushHour)(trip.startedAt),
        };
        // 3. Determine status
        const newStatus = anomalies.flaggedForReview ? 'processing' : 'completed';
        // 4. Update trip document
        await snap.ref.update({
            anomalies,
            context: tripContext,
            status: newStatus,
            processedAt: newStatus === 'completed' ? admin.firestore.FieldValue.serverTimestamp() : null,
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
    }
    catch (error) {
        functions.logger.error(`Error processing trip ${tripId}:`, error);
        // Mark trip as failed
        await snap.ref.update({
            status: 'failed',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
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
exports.onTripStatusChange = functions
    .region(region_1.EUROPE_LONDON)
    .runWith({ minInstances: 1 })
    .firestore
    .document(`${types_1.COLLECTION_NAMES.TRIPS}/{tripId}`)
    .onUpdate((0, sentry_1.wrapTrigger)(async (change, context) => {
    const tripId = context.params.tripId;
    const before = change.before.data();
    const after = change.after.data();
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
            const tripRef = admin.firestore().collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId);
            await tripRef.update({
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            functions.logger.info(`Set processedAt timestamp for trip ${tripId}`);
        }
        await updateDriverProfileAndPoolShare(after, tripId);
        checkAchievementsAsync(after.userId, after, tripId);
        // Trigger intelligent trip segmentation (async, non-blocking)
        classifyCompletedTripAsync(tripId, after);
        // Trigger AI analysis (async, non-blocking)
        try {
            const userDoc = await db.collection(types_1.COLLECTION_NAMES.USERS).doc(after.userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                // Read GPS points for AI analysis
                const pointsRef = db.collection(types_1.COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
                const pointsSnap = await pointsRef.get();
                const pointsData = pointsSnap.exists ? (pointsSnap.data()?.points || []) : [];
                analyzeCompletedTripAsync(tripId, after, pointsData, userData.drivingProfile);
            }
        }
        catch (aiSetupErr) {
            functions.logger.warn(`[AI] Failed to setup AI analysis for trip ${tripId}:`, aiSetupErr);
        }
    }
}));
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
async function finalizeTripFromPoints(tripId, tripData) {
    const pipelineStartMs = Date.now();
    try {
        // 1. Read all GPS points
        const points = await readTripPoints(tripId);
        if (points.length < 2) {
            functions.logger.warn(`Trip ${tripId} has insufficient points (${points.length}), marking as failed`);
            await db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId).update({
                status: 'failed',
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return;
        }
        functions.logger.info(`Processing ${points.length} GPS points for trip ${tripId}`);
        // 1b. DPIA compliance check (non-blocking)
        checkDpiaCompliance(tripId, points).catch((err) => functions.logger.warn('DPIA check failed (non-blocking)', { tripId, err }));
        // 2. Compute metrics from points
        const startTimestampMs = tripData.startedAt.toMillis();
        const metrics = await Sentry.startSpan({ name: 'computeTripMetrics', op: 'trip.compute' }, async () => (0, helpers_1.computeTripMetrics)(points, startTimestampMs));
        functions.logger.info(`Computed metrics for trip ${tripId}:`, {
            distanceMeters: metrics.distanceMeters,
            durationSeconds: metrics.durationSeconds,
            avgSpeedMph: Math.round(metrics.avgSpeedMps * 2.237 * 100) / 100,
            score: metrics.score,
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
        const tripRef = db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId);
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
            processedAt: finalStatus === 'completed' ? admin.firestore.FieldValue.serverTimestamp() : null,
        });
        functions.logger.info(`Trip ${tripId} finalized with status: ${finalStatus}`, {
            flaggedForReview: anomalies.flaggedForReview,
        });
        // 7. If completed (no anomalies), update driver profile.
        // Classification and AI analysis are NOT triggered here — they fire in
        // onTripStatusChange (processing → completed) which runs when this update
        // sets finalStatus = 'completed'. This avoids duplicate Claude API calls.
        if (finalStatus === 'completed') {
            const updatedTrip = (await tripRef.get()).data();
            await Sentry.startSpan({ name: 'updateDriverProfileAndPoolShare', op: 'trip.profile' }, async () => updateDriverProfileAndPoolShare(updatedTrip, tripId));
            checkAchievementsAsync(updatedTrip.userId, updatedTrip, tripId);
        }
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
        await db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId).update({
            status: 'failed',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw error;
    }
}
/**
 * Read all GPS points for a trip
 * Handles both single-document and batched storage
 */
async function readTripPoints(tripId) {
    const pointsRef = db.collection(types_1.COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
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
/**
 * Update driver profile and pool share after trip completion
 * This is the main business logic for trip processing
 */
async function updateDriverProfileAndPoolShare(trip, tripId) {
    const period = (0, helpers_1.getCurrentPoolPeriod)();
    await db.runTransaction(async (transaction) => {
        // References
        const userRef = db.collection(types_1.COLLECTION_NAMES.USERS).doc(trip.userId);
        const poolShareRef = db.collection(types_1.COLLECTION_NAMES.POOL_SHARES).doc((0, helpers_1.getShareId)(trip.userId, period));
        // Read current state
        const [userDoc, poolShareDoc] = await Promise.all([
            transaction.get(userRef),
            transaction.get(poolShareRef),
        ]);
        if (!userDoc.exists) {
            functions.logger.error(`User ${trip.userId} not found for trip ${tripId}`);
            throw new Error(`User ${trip.userId} not found`);
        }
        const user = userDoc.data();
        const poolShare = poolShareDoc.exists ? poolShareDoc.data() : null;
        // Calculate new profile values
        const distanceMiles = trip.distanceMeters / 1609.34;
        const durationMinutes = trip.durationSeconds / 60;
        const newTotalTrips = user.drivingProfile.totalTrips + 1;
        const newTotalMiles = user.drivingProfile.totalMiles + distanceMiles;
        const newTotalMinutes = user.drivingProfile.totalDrivingMinutes + durationMinutes;
        // Recalculate weighted average score
        const oldWeight = user.drivingProfile.totalTrips;
        const newScore = oldWeight === 0
            ? trip.score
            : (user.drivingProfile.currentScore * oldWeight + trip.score) / newTotalTrips;
        // Update score breakdown (weighted average)
        const newScoreBreakdown = {
            speedScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.speedScore, trip.scoreBreakdown.speedScore, oldWeight),
            brakingScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.brakingScore, trip.scoreBreakdown.brakingScore, oldWeight),
            accelerationScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.accelerationScore, trip.scoreBreakdown.accelerationScore, oldWeight),
            corneringScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.corneringScore, trip.scoreBreakdown.corneringScore, oldWeight),
            phoneUsageScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.phoneUsageScore, trip.scoreBreakdown.phoneUsageScore, oldWeight),
        };
        // Determine risk tier
        const riskTier = (0, helpers_1.calculateRiskTier)(newScore);
        // Update recent trips (FIFO, max 3)
        const tripSummary = {
            tripId,
            startedAt: trip.startedAt,
            endedAt: trip.endedAt,
            distanceMiles: Math.round(distanceMiles * 100) / 100,
            durationMinutes: Math.round(durationMinutes),
            score: trip.score,
            routeSummary: (0, helpers_1.buildRouteSummary)(trip.startLocation, trip.endLocation),
        };
        const newRecentTrips = [tripSummary, ...user.recentTrips].slice(0, 3);
        // Calculate streak days
        let streakDays = user.drivingProfile.streakDays;
        if (user.drivingProfile.lastTripAt) {
            const lastTripDate = user.drivingProfile.lastTripAt.toDate();
            const currentTripDate = trip.endedAt.toDate();
            const daysDiff = Math.floor((currentTripDate.getTime() - lastTripDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff <= 1 && trip.score >= 70) {
                streakDays += 1;
            }
            else if (daysDiff > 1) {
                streakDays = trip.score >= 70 ? 1 : 0;
            }
        }
        else {
            streakDays = trip.score >= 70 ? 1 : 0;
        }
        // Write: Update user profile
        transaction.update(userRef, {
            'drivingProfile.currentScore': Math.round(newScore * 100) / 100,
            'drivingProfile.scoreBreakdown': newScoreBreakdown,
            'drivingProfile.totalTrips': newTotalTrips,
            'drivingProfile.totalMiles': Math.round(newTotalMiles * 100) / 100,
            'drivingProfile.totalDrivingMinutes': Math.round(newTotalMinutes),
            'drivingProfile.lastTripAt': trip.endedAt,
            'drivingProfile.riskTier': riskTier,
            'drivingProfile.streakDays': streakDays,
            recentTrips: newRecentTrips,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'cloud-function',
        });
        // Write: Update pool share (if exists)
        if (poolShare) {
            const newShareTrips = poolShare.tripsIncluded + 1;
            const newShareMiles = poolShare.milesIncluded + distanceMiles;
            const newShareAvgScore = (poolShare.averageScore * poolShare.tripsIncluded + trip.score) / newShareTrips;
            transaction.update(poolShareRef, {
                tripsIncluded: newShareTrips,
                milesIncluded: Math.round(newShareMiles * 100) / 100,
                averageScore: Math.round(newShareAvgScore * 100) / 100,
                weightedScore: Math.round(newShareAvgScore * poolShare.contributionCents / 100),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        functions.logger.info(`Updated profile for user ${trip.userId}`, {
            newScore: Math.round(newScore * 100) / 100,
            totalTrips: newTotalTrips,
            totalMiles: Math.round(newTotalMiles * 100) / 100,
            riskTier,
            streakDays,
        });
    });
}
//# sourceMappingURL=trips.js.map