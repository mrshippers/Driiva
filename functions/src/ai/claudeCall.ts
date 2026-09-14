/**
 * Step 3 of the trip analyser: the Claude call, its retry/backoff wrapper and
 * the two prompts. Extracted verbatim from functions/src/ai/tripAnalysis.ts.
 */
import * as functions from 'firebase-functions/v1';
import {
  CLAUDE_MODEL,
  MAX_TOKENS,
  MAX_RETRIES,
  INITIAL_BACKOFF_MS,
  getClient,
} from './config';
import type { TripSummaryForAI, ClaudeAnalysisResponse } from './analysisTypes';
import { sleep } from './numeric';

// ---------------------------------------------------------------------------
// STEP 3: CALL CLAUDE (with retry + exponential backoff)
// ---------------------------------------------------------------------------

export async function callClaudeWithRetry(
  summary: TripSummaryForAI
): Promise<{
  analysis: ClaudeAnalysisResponse;
  promptTokens: number;
  completionTokens: number;
}> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await callClaude(summary);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);

      functions.logger.warn(
        `[AI] Claude API attempt ${attempt + 1}/${MAX_RETRIES} failed, ` +
        `retrying in ${backoffMs}ms:`,
        lastError.message
      );

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

export async function callClaude(
  summary: TripSummaryForAI
): Promise<{
  analysis: ClaudeAnalysisResponse;
  promptTokens: number;
  completionTokens: number;
}> {
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

  // Parse JSON from response - handle markdown code fences
  let jsonText = textBlock.text.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim();
  }

  let analysis: ClaudeAnalysisResponse;
  try {
    analysis = JSON.parse(jsonText);
  } catch (parseErr) {
    functions.logger.error('[AI] Failed to parse Claude response:', jsonText.slice(0, 500));
    throw new Error('Claude response is not valid JSON', { cause: parseErr });
  }

  return {
    analysis,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
  };
}

function buildSystemPrompt(): string {
  return `You are an expert automotive telematics analyst for Driiva, a UK-based insurance app that rewards safe driving. Your job is to analyze trip telemetry data and provide detailed, actionable risk assessments.

ROLE:
- Analyze GPS-derived driving metrics (speed, acceleration, braking, cornering)
- Assess overall risk level based on driving patterns
- Identify specific strengths (good behaviors) and areas for improvement
- Flag specific incidents detected from the telemetry data
- Compare the trip to the driver's historical baseline
- Provide actionable, encouraging safety tips

CONSTRAINTS:
- Scores are 0-100 where 100 is perfect. Judge this trip on its own metrics; do not anchor on a typical range.
- Risk levels: "low", "medium", "high".
- Be encouraging but honest. Drivers see these insights in the app.
- UK road context: left-hand driving, motorways/A-roads/B-roads.
- Metric units: speed in km/h, distance in km.
- Keep descriptions concise but specific.
- Strengths: 2-4 items. Improvements: 1-3 items. Incidents: only what the data supports.
- Safety tips: 2-4 actionable suggestions.
- For the comparisonToAverage field, write a clear 1-2 sentence explanation.
- Do NOT state when during the trip an incident happened: you are given totals
  and percentiles, not a timeline, so any specific moment would be invented.
- Do NOT infer weather. No weather data is supplied on this path, so
  weatherConsideration is always null.

OUTPUT FORMAT:
Return ONLY a JSON object (no markdown fences, no explanation outside JSON) with this exact schema:
{
  "overallScore": <0-100>,
  "riskLevel": "low" | "medium" | "high",
  "strengths": ["string array of good driving behaviors observed"],
  "improvements": ["string array of areas to improve"],
  "specificIncidents": [
    {
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
    "weatherConsideration": null
  },
  "historicalComparison": {
    "vsAverageScore": <integer delta from driver's average>,
    "trendDirection": "improving" | "stable" | "declining",
    "consistencyNote": "<1 sentence about driver consistency>"
  }
}`;
}

function buildUserMessage(summary: TripSummaryForAI): string {
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

