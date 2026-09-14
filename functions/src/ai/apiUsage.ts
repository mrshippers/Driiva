/**
 * Step 6 of the trip analyser: record token spend against the AI usage
 * collection. Extracted verbatim from functions/src/ai/tripAnalysis.ts.
 */
import { Timestamp } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions/v1';
import {
  COLLECTION_NAMES,
  AIUsageTrackingDocument,
} from '../types';
import { db } from './firestoreDb';
import { COST_INPUT_PER_M, COST_OUTPUT_PER_M, CLAUDE_MODEL } from './config';

// ---------------------------------------------------------------------------
// STEP 6: API USAGE TRACKING
// ---------------------------------------------------------------------------

export async function trackAPIUsage(
  tripId: string,
  userId: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  success: boolean,
  error: string | null,
): Promise<void> {
  try {
    const totalTokens = promptTokens + completionTokens;
    const estimatedCostCents = Math.ceil(
      (promptTokens * COST_INPUT_PER_M + completionTokens * COST_OUTPUT_PER_M) / 1_000_000
    );

    const usageDoc: AIUsageTrackingDocument = {
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
      calledAt: Timestamp.now(),
    };

    await db.collection(COLLECTION_NAMES.AI_USAGE_TRACKING).add(usageDoc);

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
  } catch (trackingError) {
    // Don't let tracking failure break the analysis pipeline
    functions.logger.warn('[AI] Failed to track API usage:', trackingError);
  }
}

