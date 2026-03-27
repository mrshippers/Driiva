"use strict";
/**
 * AI ANALYSIS HTTP CALLABLE
 * =========================
 * Callable Cloud Functions for on-demand AI trip analysis.
 *
 * - analyzeTripAI: Re-analyze a single trip (authenticated users)
 * - getAIInsights: Fetch AI insights for a trip (authenticated users)
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
exports.getAIInsights = exports.analyzeTripAI = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const tripAnalysis_1 = require("../ai/tripAnalysis");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = admin.firestore();
/**
 * Callable: Re-analyze a trip with Claude AI
 *
 * Input: { tripId: string }
 * Returns: { success: boolean, insightId?: string, error?: string }
 *
 * Auth required. Users can only analyze their own trips.
 */
exports.analyzeTripAI = functions
    .region(region_1.EUROPE_LONDON)
    .runWith({ secrets: ['ANTHROPIC_API_KEY'] })
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    // Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in to request AI analysis.');
    }
    const { tripId } = data;
    if (!tripId || typeof tripId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'tripId is required and must be a string.');
    }
    const userId = context.auth.uid;
    try {
        // 1. Fetch trip
        const tripDoc = await db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId).get();
        if (!tripDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Trip not found.');
        }
        const trip = tripDoc.data();
        // 2. Authorization: user can only analyze their own trips
        if (trip.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'You can only analyze your own trips.');
        }
        // 3. Trip must be completed
        if (trip.status !== 'completed') {
            throw new functions.https.HttpsError('failed-precondition', `Trip is not completed (status: ${trip.status}).`);
        }
        // 4. Rate limit: check if analysis already exists and is recent (< 1 hour)
        const existingInsight = await db
            .collection(types_1.COLLECTION_NAMES.TRIP_AI_INSIGHTS)
            .doc(tripId)
            .get();
        if (existingInsight.exists) {
            const insightData = existingInsight.data();
            const ageMs = Date.now() - insightData.analyzedAt.toMillis();
            const ONE_HOUR = 60 * 60 * 1000;
            if (ageMs < ONE_HOUR) {
                return {
                    success: true,
                    insightId: tripId,
                    cached: true,
                    message: 'AI analysis already exists and is recent.',
                };
            }
        }
        // 5. Fetch GPS points
        const pointsDoc = await db
            .collection(types_1.COLLECTION_NAMES.TRIP_POINTS)
            .doc(tripId)
            .get();
        let points = [];
        if (pointsDoc.exists) {
            const pointsData = pointsDoc.data();
            points = pointsData.points || [];
        }
        // 6. Fetch user profile
        const userDoc = await db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found.');
        }
        const userData = userDoc.data();
        // 7. Run analysis
        const insightId = await (0, tripAnalysis_1.analyzeTrip)(tripId, trip, points, userData.drivingProfile);
        if (!insightId) {
            return {
                success: false,
                error: 'Trip is too short for AI analysis (< 0.8 km or < 2 minutes).',
            };
        }
        return {
            success: true,
            insightId,
            cached: false,
        };
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        functions.logger.error(`[AI] On-demand analysis failed for trip ${tripId}:`, error);
        throw new functions.https.HttpsError('internal', 'AI analysis failed. Please try again later.');
    }
}));
/**
 * Callable: Fetch AI insights for a trip
 *
 * Input: { tripId: string }
 * Returns: { success: boolean, insights?: TripAIInsightDocument }
 *
 * Auth required. Users can only view insights for their own trips.
 */
exports.getAIInsights = functions
    .region(region_1.EUROPE_LONDON)
    .runWith({ secrets: ['ANTHROPIC_API_KEY'] })
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const { tripId } = data;
    if (!tripId || typeof tripId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'tripId is required.');
    }
    const userId = context.auth.uid;
    try {
        const insightDoc = await db
            .collection(types_1.COLLECTION_NAMES.TRIP_AI_INSIGHTS)
            .doc(tripId)
            .get();
        if (!insightDoc.exists) {
            return { success: true, insights: null };
        }
        const insights = insightDoc.data();
        // Authorization check
        if (insights.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'You can only view your own trip insights.');
        }
        // Convert Timestamps to ISO strings for client consumption
        return {
            success: true,
            insights: {
                ...insights,
                analyzedAt: insights.analyzedAt?.toDate?.()?.toISOString() ?? null,
                createdAt: insights.createdAt?.toDate?.()?.toISOString() ?? null,
            },
        };
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        functions.logger.error(`[AI] getAIInsights failed for trip ${tripId}:`, error);
        throw new functions.https.HttpsError('internal', 'Failed to retrieve AI insights.');
    }
}));
//# sourceMappingURL=aiAnalysis.js.map