/**
 * AI ANALYSIS HTTP CALLABLE
 * =========================
 * Callable Cloud Functions for on-demand AI trip analysis.
 *
 * - analyzeTripAI: Re-analyze a single trip (authenticated users)
 * - getAIInsights: Fetch AI insights for a trip (authenticated users)
 */
import * as functions from 'firebase-functions';
/**
 * Callable: Re-analyze a trip with Claude AI
 *
 * Input: { tripId: string }
 * Returns: { success: boolean, insightId?: string, error?: string }
 *
 * Auth required. Users can only analyze their own trips.
 */
export declare const analyzeTripAI: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Callable: Fetch AI insights for a trip
 *
 * Input: { tripId: string }
 * Returns: { success: boolean, insights?: TripAIInsightDocument }
 *
 * Auth required. Users can only view insights for their own trips.
 */
export declare const getAIInsights: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=aiAnalysis.d.ts.map