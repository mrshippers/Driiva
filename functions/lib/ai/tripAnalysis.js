"use strict";
/**
 * AI TRIP ANALYSIS - Claude Sonnet 4 Integration
 * ================================================
 * Advanced trip scoring using Anthropic's Claude API.
 *
 * Pipeline:
 *   1. Prepare a structured summary of the trip telemetry
 *   2. Call Claude with a carefully engineered prompt (with retry + backoff)
 *   3. Parse the structured JSON response
 *   4. Store full insight in tripAiInsights/{tripId}
 *   5. Embed analysis on trips/{tripId}.aiAnalysis for fast reads
 *   6. Track API usage/cost in aiUsageTracking collection
 *
 * The analysis is always **non-blocking**: the driver sees the basic
 * algorithmic score immediately, and AI insights are layered on
 * asynchronously (typically < 5 s).
 *
 * Error handling:
 *   - 3 retries with exponential backoff (1 s → 2 s → 4 s)
 *   - Falls back to algorithmic score on failure
 *   - All errors logged to Firebase + tracked in aiUsageTracking
 *
 * Cost control:
 *   - claude-sonnet-4-20250514 (cost-efficient reasoning model)
 *   - Trip data summarised/compressed (no raw GPS dump)
 *   - max_tokens capped at 1 500
 *   - Per-call cost tracked in Firestore for monitoring
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
exports.analyzeTrip = analyzeTrip;
const firestore_1 = require("firebase-admin/firestore");
const functions = __importStar(require("firebase-functions"));
const types_1 = require("../types");
const firestoreDb_1 = require("./firestoreDb");
const config_1 = require("./config");
const tripSummary_1 = require("./tripSummary");
const claudeCall_1 = require("./claudeCall");
const insightDocument_1 = require("./insightDocument");
const apiUsage_1 = require("./apiUsage");
// ---------------------------------------------------------------------------
// MAIN ENTRY POINT
// ---------------------------------------------------------------------------
/**
 * Analyse a completed trip with Claude Sonnet 4.
 *
 * @param tripId     Firestore document ID
 * @param trip       The completed trip document
 * @param points     Raw GPS points (used for speed/acceleration profiling)
 * @param profile    The driver's current profile (for historical comparison)
 * @returns          The stored insight document ID, or null if skipped/failed
 */
async function analyzeTrip(tripId, trip, points, profile) {
    const startMs = Date.now();
    // Idempotency: skip if insights already exist and are recent (< 1 hour old)
    const existingDoc = await firestoreDb_1.db.collection(types_1.COLLECTION_NAMES.TRIP_AI_INSIGHTS).doc(tripId).get();
    if (existingDoc.exists) {
        const existingData = existingDoc.data();
        const analyzedAt = existingData?.analyzedAt;
        if (analyzedAt) {
            const ageMs = Date.now() - (typeof analyzedAt.toMillis === 'function' ? analyzedAt.toMillis() : 0);
            const ONE_HOUR = 60 * 60 * 1000;
            if (ageMs < ONE_HOUR) {
                functions.logger.info(`[AI] Skipping trip ${tripId}: recent analysis exists (${Math.round(ageMs / 1000)}s old)`);
                return tripId;
            }
        }
    }
    // Guard: skip very short trips (< 0.5 miles / ~0.8 km or < 2 minutes)
    const distanceKm = trip.distanceMeters / 1000;
    const durationMinutes = trip.durationSeconds / 60;
    if (distanceKm < 0.8 || durationMinutes < 2) {
        functions.logger.info(`[AI] Skipping trip ${tripId}: too short (${distanceKm.toFixed(1)} km, ${durationMinutes.toFixed(0)} min)`);
        return null;
    }
    try {
        // 1. Fetch segmentation data (if available)
        const segmentation = await fetchSegmentation(tripId);
        // 2. Build compact summary
        const summary = (0, tripSummary_1.buildTripSummary)(tripId, trip, points, profile, segmentation);
        // 3. Call Claude with retry logic
        const { analysis, promptTokens, completionTokens } = await (0, claudeCall_1.callClaudeWithRetry)(summary);
        const latencyMs = Date.now() - startMs;
        // 4. Store full insight document in tripAiInsights collection
        const insightDoc = (0, insightDocument_1.buildInsightDocument)(tripId, trip, summary, analysis, promptTokens, completionTokens, latencyMs);
        await firestoreDb_1.db
            .collection(types_1.COLLECTION_NAMES.TRIP_AI_INSIGHTS)
            .doc(tripId)
            .set(insightDoc);
        // 5. Embed analysis on trips/{tripId}.aiAnalysis
        const aiAnalysis = {
            score: insightDoc.overallScore,
            riskLevel: insightDoc.riskLevel,
            strengths: insightDoc.strengths,
            improvements: insightDoc.improvements,
            incidents: insightDoc.specificIncidents,
            tips: insightDoc.safetyTips,
            comparisonToAverage: insightDoc.comparisonToAverage,
            analyzedAt: insightDoc.analyzedAt,
            modelUsed: config_1.CLAUDE_MODEL,
        };
        await firestoreDb_1.db
            .collection(types_1.COLLECTION_NAMES.TRIPS)
            .doc(tripId)
            .update({
            aiAnalysis,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedBy: 'ai-analysis',
        });
        // 6. Track API usage for cost monitoring
        await (0, apiUsage_1.trackAPIUsage)(tripId, trip.userId, promptTokens, completionTokens, latencyMs, true, null);
        functions.logger.info(`[AI] Trip ${tripId} analysed in ${latencyMs}ms`, {
            overallScore: insightDoc.overallScore,
            riskLevel: insightDoc.riskLevel,
            strengths: insightDoc.strengths.length,
            improvements: insightDoc.improvements.length,
            incidents: insightDoc.specificIncidents.length,
            tokens: promptTokens + completionTokens,
        });
        return tripId;
    }
    catch (error) {
        const latencyMs = Date.now() - startMs;
        // Track failed attempt for cost monitoring
        await (0, apiUsage_1.trackAPIUsage)(tripId, trip.userId, 0, 0, latencyMs, false, String(error));
        functions.logger.error(`[AI] Analysis failed for trip ${tripId} after ${config_1.MAX_RETRIES} attempts:`, error);
        // Non-blocking - don't throw. The trip is already scored algorithmically.
        return null;
    }
}
// ---------------------------------------------------------------------------
// STEP 1: FETCH SEGMENTATION
// ---------------------------------------------------------------------------
async function fetchSegmentation(tripId) {
    try {
        const snap = await firestoreDb_1.db
            .collection(types_1.COLLECTION_NAMES.TRIP_SEGMENTS)
            .doc(tripId)
            .get();
        return snap.exists ? snap.data() : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=tripAnalysis.js.map