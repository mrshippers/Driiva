"use strict";
/**
 * AI TRIP ANALYSIS — Claude Sonnet 4 Integration
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeTrip = analyzeTrip;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const db = admin.firestore();
// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1500;
/** Retry config */
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000; // 1 s → 2 s → 4 s
/**
 * Estimated cost per token (USD) for claude-sonnet-4-20250514.
 * Input: $3/M tokens, Output: $15/M tokens.
 * Stored as USD cents per token × 100000 for integer math.
 */
const COST_INPUT_PER_M = 300; // $3.00 per million input tokens
const COST_OUTPUT_PER_M = 1500; // $15.00 per million output tokens
/** Lazy-initialised Anthropic client (avoids crash when env var is missing). */
let _client = null;
function getClient() {
    if (!_client) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not set. ' +
                'Run: firebase functions:secrets:set ANTHROPIC_API_KEY');
        }
        _client = new sdk_1.default({ apiKey });
    }
    return _client;
}
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
    const existingDoc = await db.collection(types_1.COLLECTION_NAMES.TRIP_AI_INSIGHTS).doc(tripId).get();
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
        const summary = buildTripSummary(tripId, trip, points, profile, segmentation);
        // 3. Call Claude with retry logic
        const { analysis, promptTokens, completionTokens } = await callClaudeWithRetry(summary);
        const latencyMs = Date.now() - startMs;
        // 4. Store full insight document in tripAiInsights collection
        const insightDoc = buildInsightDocument(tripId, trip, summary, analysis, promptTokens, completionTokens, latencyMs);
        await db
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
            modelUsed: CLAUDE_MODEL,
        };
        await db
            .collection(types_1.COLLECTION_NAMES.TRIPS)
            .doc(tripId)
            .update({
            aiAnalysis,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'ai-analysis',
        });
        // 6. Track API usage for cost monitoring
        await trackAPIUsage(tripId, trip.userId, promptTokens, completionTokens, latencyMs, true, null);
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
        await trackAPIUsage(tripId, trip.userId, 0, 0, latencyMs, false, String(error));
        functions.logger.error(`[AI] Analysis failed for trip ${tripId} after ${MAX_RETRIES} attempts:`, error);
        // Non-blocking — don't throw. The trip is already scored algorithmically.
        return null;
    }
}
// ---------------------------------------------------------------------------
// STEP 1: FETCH SEGMENTATION
// ---------------------------------------------------------------------------
async function fetchSegmentation(tripId) {
    try {
        const snap = await db
            .collection(types_1.COLLECTION_NAMES.TRIP_SEGMENTS)
            .doc(tripId)
            .get();
        return snap.exists ? snap.data() : null;
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// STEP 2: BUILD TRIP SUMMARY
// ---------------------------------------------------------------------------
function buildTripSummary(tripId, trip, points, profile, segmentation) {
    const MPS_TO_KMH = 3.6;
    // Speed stats from points
    const speeds = points
        .map(p => (p.spd / 100) * MPS_TO_KMH) // integer m/s*100 → km/h
        .filter(s => s >= 0 && s < 300)
        .sort((a, b) => a - b);
    const speedProfile = speeds.length >= 5
        ? {
            p10: percentile(speeds, 10),
            p25: percentile(speeds, 25),
            p50: percentile(speeds, 50),
            p75: percentile(speeds, 75),
            p90: percentile(speeds, 90),
        }
        : { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
    // Acceleration profile from consecutive points
    const accels = [];
    for (let i = 1; i < points.length; i++) {
        const dt = (points[i].t - points[i - 1].t) / 1000;
        if (dt > 0 && dt < 10) {
            const dv = (points[i].spd - points[i - 1].spd) / 100; // m/s
            accels.push(dv / dt);
        }
    }
    const accelerationProfile = accels.length > 0
        ? {
            maxDecelMps2: round2(Math.min(...accels)),
            maxAccelMps2: round2(Math.max(...accels)),
            avgAbsAccelMps2: round2(accels.reduce((s, a) => s + Math.abs(a), 0) / accels.length),
        }
        : { maxDecelMps2: 0, maxAccelMps2: 0, avgAbsAccelMps2: 0 };
    // Speed variance in km/h
    const avgKmh = speeds.length > 0
        ? speeds.reduce((s, v) => s + v, 0) / speeds.length
        : 0;
    const variance = speeds.length > 0
        ? Math.sqrt(speeds.reduce((s, v) => s + (v - avgKmh) ** 2, 0) / speeds.length)
        : 0;
    // Determine time context
    const tripDate = trip.startedAt.toDate();
    const hours = tripDate.getHours();
    const timeOfDay = hours < 6
        ? 'late_night'
        : hours < 12
            ? 'morning'
            : hours < 17
                ? 'afternoon'
                : hours < 21
                    ? 'evening'
                    : 'night';
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    // Determine recent trend from profile
    const recentTrend = determineRecentTrend(profile);
    return {
        tripId,
        distanceKm: round2(trip.distanceMeters / 1000),
        durationMinutes: round2(trip.durationSeconds / 60),
        avgSpeedKmh: round2(avgKmh),
        maxSpeedKmh: round2(speeds.length > 0 ? speeds[speeds.length - 1] : 0),
        speedVarianceKmh: round2(variance),
        events: {
            hardBraking: trip.events.hardBrakingCount,
            hardAcceleration: trip.events.hardAccelerationCount,
            speedingSeconds: trip.events.speedingSeconds,
            sharpTurns: trip.events.sharpTurnCount,
            phonePickups: trip.events.phonePickupCount,
        },
        algorithmicScore: trip.score,
        scoreBreakdown: {
            speed: trip.scoreBreakdown.speedScore,
            braking: trip.scoreBreakdown.brakingScore,
            acceleration: trip.scoreBreakdown.accelerationScore,
            cornering: trip.scoreBreakdown.corneringScore,
            phoneUsage: trip.scoreBreakdown.phoneUsageScore,
        },
        context: {
            timeOfDay,
            dayOfWeek: days[tripDate.getDay()],
            isNightDriving: trip.context?.isNightDriving ?? false,
            isRushHour: trip.context?.isRushHour ?? false,
        },
        segmentation: segmentation
            ? {
                totalStops: segmentation.summary.totalStops,
                totalSegments: segmentation.summary.totalTrips,
            }
            : null,
        driverHistory: {
            totalTrips: profile.totalTrips,
            averageScore: round2(profile.currentScore),
            totalMiles: round2(profile.totalMiles),
            riskTier: profile.riskTier,
            streakDays: profile.streakDays,
            recentTrend,
        },
        speedProfile,
        accelerationProfile,
    };
}
function determineRecentTrend(profile) {
    // If fewer than 3 trips, not enough data to determine trend
    if (profile.totalTrips < 3)
        return 'stable';
    // Use streak as a proxy: positive streak = improving
    if (profile.streakDays >= 3)
        return 'improving';
    if (profile.streakDays === 0 && profile.totalTrips > 5)
        return 'declining';
    return 'stable';
}
// ---------------------------------------------------------------------------
// STEP 3: CALL CLAUDE (with retry + exponential backoff)
// ---------------------------------------------------------------------------
async function callClaudeWithRetry(summary) {
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await callClaude(summary);
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
            functions.logger.warn(`[AI] Claude API attempt ${attempt + 1}/${MAX_RETRIES} failed, ` +
                `retrying in ${backoffMs}ms:`, lastError.message);
            // Don't retry on non-retryable errors (auth, bad request)
            const message = lastError.message.toLowerCase();
            if (message.includes('authentication') || message.includes('invalid_api_key') || message.includes('not valid json')) {
                functions.logger.error(`[AI] Non-retryable error, aborting:`, lastError.message);
                throw lastError;
            }
            await sleep(backoffMs);
        }
    }
    throw lastError || new Error(`Claude API failed after ${MAX_RETRIES} attempts`);
}
async function callClaude(summary) {
    const client = getClient();
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(summary);
    const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [
            { role: 'user', content: userMessage },
        ],
    });
    // Extract text content
    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Claude returned no text content');
    }
    // Parse JSON from response — handle markdown code fences
    let jsonText = textBlock.text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        jsonText = fenceMatch[1].trim();
    }
    let analysis;
    try {
        analysis = JSON.parse(jsonText);
    }
    catch (parseErr) {
        functions.logger.error('[AI] Failed to parse Claude response:', jsonText.slice(0, 500));
        throw new Error(`Claude response is not valid JSON: ${parseErr}`);
    }
    return {
        analysis,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
    };
}
function buildSystemPrompt() {
    return `You are an expert automotive telematics analyst for Driiva, a UK-based insurance app that rewards safe driving. Your job is to analyze trip telemetry data and provide detailed, actionable risk assessments.

ROLE:
- Analyze GPS-derived driving metrics (speed, acceleration, braking, cornering)
- Assess overall risk level based on driving patterns
- Identify specific strengths (good behaviors) and areas for improvement
- Flag specific incidents detected from the telemetry data
- Compare the trip to the driver's historical baseline
- Provide actionable, encouraging safety tips

CONSTRAINTS:
- Scores are 0-100 where 100 is perfect. Most safe trips score 80-95.
- Risk levels: "low", "medium", "high".
- Be encouraging but honest. Drivers see these insights in the app.
- UK road context: left-hand driving, motorways/A-roads/B-roads.
- Metric units: speed in km/h, distance in km.
- Keep descriptions concise but specific.
- Strengths: 2-4 items. Improvements: 1-3 items. Incidents: only what the data supports.
- Safety tips: 2-4 actionable suggestions.
- For the comparisonToAverage field, write a clear 1-2 sentence explanation.

OUTPUT FORMAT:
Return ONLY a JSON object (no markdown fences, no explanation outside JSON) with this exact schema:
{
  "overallScore": <0-100>,
  "riskLevel": "low" | "medium" | "high",
  "strengths": ["string array of good driving behaviors observed"],
  "improvements": ["string array of areas to improve"],
  "specificIncidents": [
    {
      "timestamp": "<time offset description, e.g. '3 min into trip' or approximate ISO>",
      "type": "harsh_braking" | "speeding" | "rapid_acceleration" | "sharp_turn" | "phone_usage" | "tailgating" | "erratic_driving",
      "severity": "low" | "medium" | "high",
      "description": "<what happened, 1 sentence>"
    }
  ],
  "safetyTips": ["actionable advice string array"],
  "comparisonToAverage": "<better/worse/similar with explanation>",
  "patterns": [
    {
      "category": "speed_management" | "braking_behavior" | "acceleration_pattern" | "cornering_technique" | "following_distance" | "lane_discipline" | "contextual_awareness" | "fatigue_risk" | "general",
      "title": "<short title>",
      "description": "<1-2 sentence description>",
      "severity": "low" | "medium" | "high",
      "scoreImpact": <negative=penalty, positive=bonus, integer>
    }
  ],
  "scoreAdjustment": {
    "adjustedScore": <0-100, your recommended score>,
    "delta": <integer, adjustedScore - algorithmicScore>,
    "reasoning": "<1 sentence explaining why you adjusted or kept the score>",
    "confidence": <0.0-1.0>
  },
  "contextFactors": {
    "estimatedRoadType": "motorway" | "a_road" | "urban" | "residential" | "mixed",
    "weatherConsideration": <string or null>
  },
  "historicalComparison": {
    "vsAverageScore": <integer delta from driver's average>,
    "trendDirection": "improving" | "stable" | "declining",
    "consistencyNote": "<1 sentence about driver consistency>"
  }
}`;
}
function buildUserMessage(summary) {
    return `Analyze this driving trip and provide risk assessment:

Trip Data:
- Distance: ${summary.distanceKm} km
- Duration: ${summary.durationMinutes} minutes
- Average speed: ${summary.avgSpeedKmh} km/h
- Max speed: ${summary.maxSpeedKmh} km/h
- Speed variance: ${summary.speedVarianceKmh} km/h

Speed Distribution (km/h):
- 10th percentile: ${summary.speedProfile.p10}
- 25th percentile: ${summary.speedProfile.p25}
- Median: ${summary.speedProfile.p50}
- 75th percentile: ${summary.speedProfile.p75}
- 90th percentile: ${summary.speedProfile.p90}

Acceleration Profile:
- Max deceleration: ${summary.accelerationProfile.maxDecelMps2} m/s²
- Max acceleration: ${summary.accelerationProfile.maxAccelMps2} m/s²
- Average absolute acceleration: ${summary.accelerationProfile.avgAbsAccelMps2} m/s²

Driving Events:
- Harsh braking events: ${summary.events.hardBraking}
- Rapid accelerations: ${summary.events.hardAcceleration}
- Speeding (seconds): ${summary.events.speedingSeconds}
- Sharp turns: ${summary.events.sharpTurns}
- Phone pickups: ${summary.events.phonePickups}

Algorithmic Score: ${summary.algorithmicScore}/100
Score Breakdown:
- Speed: ${summary.scoreBreakdown.speed}/100
- Braking: ${summary.scoreBreakdown.braking}/100
- Acceleration: ${summary.scoreBreakdown.acceleration}/100
- Cornering: ${summary.scoreBreakdown.cornering}/100
- Phone Usage: ${summary.scoreBreakdown.phoneUsage}/100

Context:
- Time: ${summary.context.timeOfDay}, ${summary.context.dayOfWeek}
- Night driving: ${summary.context.isNightDriving}
- Rush hour: ${summary.context.isRushHour}
${summary.segmentation ? `- Trip segments: ${summary.segmentation.totalSegments}, stops: ${summary.segmentation.totalStops}` : '- No segmentation data available'}

Driver Context:
- Historical average score: ${summary.driverHistory.averageScore}/100
- Total trips: ${summary.driverHistory.totalTrips}
- Total miles: ${summary.driverHistory.totalMiles}
- Risk tier: ${summary.driverHistory.riskTier}
- Current streak: ${summary.driverHistory.streakDays} days
- Recent trend: ${summary.driverHistory.recentTrend}`;
}
// ---------------------------------------------------------------------------
// STEP 4: BUILD FIRESTORE DOCUMENT
// ---------------------------------------------------------------------------
function buildInsightDocument(tripId, trip, summary, analysis, promptTokens, completionTokens, latencyMs) {
    const now = admin.firestore.Timestamp.now();
    // Validate and clamp core fields
    const overallScore = clamp(analysis.overallScore ?? trip.score, 0, 100);
    const riskLevel = validateRiskLevel(analysis.riskLevel);
    const adjustedScore = clamp(analysis.scoreAdjustment?.adjustedScore ?? overallScore, 0, 100);
    // Strengths & improvements — simple string arrays
    const strengths = (analysis.strengths || [])
        .slice(0, 5)
        .map(s => String(s).trim())
        .filter(s => s.length > 0);
    const improvements = (analysis.improvements || [])
        .slice(0, 4)
        .map(s => String(s).trim())
        .filter(s => s.length > 0);
    // Specific incidents
    const specificIncidents = (analysis.specificIncidents || [])
        .slice(0, 10)
        .map(inc => ({
        timestamp: String(inc.timestamp || 'Unknown'),
        type: validateIncidentType(inc.type),
        severity: validateRiskLevel(inc.severity),
        description: String(inc.description || 'Incident detected'),
    }));
    // Patterns (detailed breakdown)
    const patterns = (analysis.patterns || []).slice(0, 5).map(p => ({
        category: validatePatternCategory(p.category),
        title: String(p.title || 'Pattern detected'),
        description: String(p.description || ''),
        severity: validateRiskLevel(p.severity),
        scoreImpact: clamp(p.scoreImpact ?? 0, -20, 20),
    }));
    // Safety tips — simple string array
    const safetyTips = (analysis.safetyTips || [])
        .slice(0, 5)
        .map(s => String(s).trim())
        .filter(s => s.length > 0);
    // Comparison to average
    const comparisonToAverage = String(analysis.comparisonToAverage || 'Similar to your average performance.');
    // Score adjustment
    const scoreAdjustment = {
        originalScore: trip.score,
        adjustedScore,
        delta: adjustedScore - trip.score,
        reasoning: String(analysis.scoreAdjustment?.reasoning || 'Score within expected range.'),
        confidence: clamp(analysis.scoreAdjustment?.confidence ?? 0.7, 0, 1),
    };
    return {
        tripId,
        userId: trip.userId,
        overallScore,
        riskLevel,
        summary: comparisonToAverage, // Use comparisonToAverage as the summary
        strengths,
        improvements,
        specificIncidents,
        patterns,
        safetyTips,
        comparisonToAverage,
        scoreAdjustment,
        contextFactors: {
            timeOfDay: summary.context.timeOfDay,
            dayOfWeek: summary.context.dayOfWeek,
            isNightDriving: summary.context.isNightDriving,
            isRushHour: summary.context.isRushHour,
            estimatedRoadType: String(analysis.contextFactors?.estimatedRoadType || 'mixed'),
            weatherConsideration: analysis.contextFactors?.weatherConsideration || null,
        },
        historicalComparison: {
            vsAverageScore: analysis.historicalComparison?.vsAverageScore ?? 0,
            trendDirection: validateTrend(analysis.historicalComparison?.trendDirection),
            consistencyNote: String(analysis.historicalComparison?.consistencyNote || 'Insufficient data for comparison.'),
        },
        model: CLAUDE_MODEL,
        modelVersion: CLAUDE_MODEL,
        promptTokens,
        completionTokens,
        latencyMs,
        analyzedAt: now,
        createdAt: now,
        createdBy: 'ai-analysis',
    };
}
// ---------------------------------------------------------------------------
// STEP 6: API USAGE TRACKING
// ---------------------------------------------------------------------------
async function trackAPIUsage(tripId, userId, promptTokens, completionTokens, latencyMs, success, error) {
    try {
        const totalTokens = promptTokens + completionTokens;
        const estimatedCostCents = Math.ceil((promptTokens * COST_INPUT_PER_M + completionTokens * COST_OUTPUT_PER_M) / 1000000);
        const usageDoc = {
            tripId,
            userId,
            model: CLAUDE_MODEL,
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostCents,
            latencyMs,
            success,
            error,
            calledAt: admin.firestore.Timestamp.now(),
        };
        await db.collection(types_1.COLLECTION_NAMES.AI_USAGE_TRACKING).add(usageDoc);
        functions.logger.info('[metric] ai_analysis', {
            metric: 'ai_analysis',
            tripId,
            userId,
            success,
            latencyMs,
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostCents,
            model: CLAUDE_MODEL,
            error,
        });
    }
    catch (trackingError) {
        // Don't let tracking failure break the analysis pipeline
        functions.logger.warn('[AI] Failed to track API usage:', trackingError);
    }
}
// ---------------------------------------------------------------------------
// VALIDATORS
// ---------------------------------------------------------------------------
const RISK_LEVELS = ['low', 'medium', 'high'];
function validateRiskLevel(value) {
    const lower = (value || '').toLowerCase();
    return RISK_LEVELS.includes(lower) ? lower : 'medium';
}
const INCIDENT_TYPES = [
    'harsh_braking', 'speeding', 'rapid_acceleration', 'sharp_turn',
    'phone_usage', 'tailgating', 'erratic_driving',
];
function validateIncidentType(value) {
    const lower = (value || '').toLowerCase();
    return INCIDENT_TYPES.includes(lower) ? lower : 'erratic_driving';
}
const PATTERN_CATEGORIES = [
    'speed_management', 'braking_behavior', 'acceleration_pattern',
    'cornering_technique', 'following_distance', 'lane_discipline',
    'contextual_awareness', 'fatigue_risk', 'general',
];
function validatePatternCategory(value) {
    const lower = (value || '').toLowerCase();
    return PATTERN_CATEGORIES.includes(lower) ? lower : 'general';
}
function validateTrend(value) {
    const lower = (value || '').toLowerCase();
    if (lower === 'improving' || lower === 'stable' || lower === 'declining')
        return lower;
    return 'stable';
}
// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
function percentile(sorted, p) {
    if (sorted.length === 0)
        return 0;
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper)
        return round2(sorted[lower]);
    return round2(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=tripAnalysis.js.map