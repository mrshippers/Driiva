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

import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions/v1';
import {
  COLLECTION_NAMES,
  TripDocument,
  TripPoint,
  TripAIAnalysisEmbed,
  DrivingProfileData,
  TripSegmentsDocument,
} from '../types';
import { db } from './firestoreDb';
import { CLAUDE_MODEL, MAX_RETRIES } from './config';
import { buildTripSummary } from './tripSummary';
import { callClaudeWithRetry } from './claudeCall';
import { buildInsightDocument } from './insightDocument';
import { trackAPIUsage } from './apiUsage';

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
export async function analyzeTrip(
  tripId: string,
  trip: TripDocument,
  points: TripPoint[],
  profile: DrivingProfileData,
): Promise<string | null> {
  const startMs = Date.now();

  // Idempotency: skip if insights already exist and are recent (< 1 hour old)
  const existingDoc = await db.collection(COLLECTION_NAMES.TRIP_AI_INSIGHTS).doc(tripId).get();
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
    functions.logger.info(
      `[AI] Skipping trip ${tripId}: too short (${distanceKm.toFixed(1)} km, ${durationMinutes.toFixed(0)} min)`
    );
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
    const insightDoc = buildInsightDocument(
      tripId,
      trip,
      summary,
      analysis,
      promptTokens,
      completionTokens,
      latencyMs,
    );

    await db
      .collection(COLLECTION_NAMES.TRIP_AI_INSIGHTS)
      .doc(tripId)
      .set(insightDoc);

    // 5. Embed analysis on trips/{tripId}.aiAnalysis
    const aiAnalysis: TripAIAnalysisEmbed = {
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
      .collection(COLLECTION_NAMES.TRIPS)
      .doc(tripId)
      .update({
        aiAnalysis,
        updatedAt: FieldValue.serverTimestamp(),
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
  } catch (error) {
    const latencyMs = Date.now() - startMs;

    // Track failed attempt for cost monitoring
    await trackAPIUsage(tripId, trip.userId, 0, 0, latencyMs, false, String(error));

    functions.logger.error(`[AI] Analysis failed for trip ${tripId} after ${MAX_RETRIES} attempts:`, error);
    // Non-blocking - don't throw. The trip is already scored algorithmically.
    return null;
  }
}

// ---------------------------------------------------------------------------
// STEP 1: FETCH SEGMENTATION
// ---------------------------------------------------------------------------

async function fetchSegmentation(
  tripId: string
): Promise<TripSegmentsDocument | null> {
  try {
    const snap = await db
      .collection(COLLECTION_NAMES.TRIP_SEGMENTS)
      .doc(tripId)
      .get();
    return snap.exists ? (snap.data() as TripSegmentsDocument) : null;
  } catch {
    return null;
  }
}

