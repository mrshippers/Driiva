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
exports.onTripStatusChange = exports.onTripCreate = exports.updateDriverProfileAndPoolShare = exports.finalizeTripFromPoints = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const weather_1 = require("../utils/weather");
const types_1 = require("../types");
const helpers_1 = require("../utils/helpers");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db_1 = require("../lib/db");
const tripSideEffects_1 = require("./tripSideEffects");
const tripFinalisation_1 = require("./tripFinalisation");
const driverProfile_1 = require("./driverProfile");
// The two helpers below were declared here before this file was split; they
// stay part of this module's public surface.
var tripFinalisation_2 = require("./tripFinalisation");
Object.defineProperty(exports, "finalizeTripFromPoints", { enumerable: true, get: function () { return tripFinalisation_2.finalizeTripFromPoints; } });
var driverProfile_2 = require("./driverProfile");
Object.defineProperty(exports, "updateDriverProfileAndPoolShare", { enumerable: true, get: function () { return driverProfile_2.updateDriverProfileAndPoolShare; } });
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
    // Do NOT change status here - distanceMeters/durationSeconds are 0 at
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
            processedAt: newStatus === 'completed' ? firestore_1.FieldValue.serverTimestamp() : null,
        });
        functions.logger.info(`Trip ${tripId} processed`, {
            status: newStatus,
            flagged: anomalies.flaggedForReview
        });
        // 5. If trip is completed (no anomalies), trigger profile update + achievements
        if (newStatus === 'completed') {
            await (0, driverProfile_1.updateDriverProfileAndPoolShare)(trip, tripId);
            (0, tripSideEffects_1.checkAchievementsAsync)(trip.userId, trip, tripId);
        }
    }
    catch (error) {
        functions.logger.error(`Error processing trip ${tripId}:`, error);
        // Mark trip as failed
        await snap.ref.update({
            status: 'failed',
            processedAt: firestore_1.FieldValue.serverTimestamp(),
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
        await (0, tripFinalisation_1.finalizeTripFromPoints)(tripId, after);
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
            const tripRef = (0, firestore_1.getFirestore)().collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId);
            await tripRef.update({
                processedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            functions.logger.info(`Set processedAt timestamp for trip ${tripId}`);
        }
        await (0, driverProfile_1.updateDriverProfileAndPoolShare)(after, tripId);
        (0, tripSideEffects_1.checkAchievementsAsync)(after.userId, after, tripId);
        // Trigger intelligent trip segmentation (async, non-blocking)
        (0, tripSideEffects_1.classifyCompletedTripAsync)(tripId, after);
        // Trigger AI analysis (async, non-blocking)
        try {
            const userDoc = await db_1.db.collection(types_1.COLLECTION_NAMES.USERS).doc(after.userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                // Read GPS points for AI analysis
                const pointsRef = db_1.db.collection(types_1.COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
                const pointsSnap = await pointsRef.get();
                const pointsData = pointsSnap.exists ? (pointsSnap.data()?.points || []) : [];
                (0, tripSideEffects_1.analyzeCompletedTripAsync)(tripId, after, pointsData, userData.drivingProfile);
            }
        }
        catch (aiSetupErr) {
            functions.logger.warn(`[AI] Failed to setup AI analysis for trip ${tripId}:`, aiSetupErr);
        }
    }
}));
//# sourceMappingURL=trips.js.map