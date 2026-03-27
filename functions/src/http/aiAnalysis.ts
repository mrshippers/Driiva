/**
 * AI ANALYSIS HTTP CALLABLE
 * =========================
 * Callable Cloud Functions for on-demand AI trip analysis.
 *
 * - analyzeTripAI: Re-analyze a single trip (authenticated users)
 * - getAIInsights: Fetch AI insights for a trip (authenticated users)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  COLLECTION_NAMES,
  TripDocument,
  TripPointsDocument,
  TripPoint,
  UserDocument,
  TripAIInsightDocument,
} from '../types';
import { analyzeTrip } from '../ai/tripAnalysis';
import { EUROPE_LONDON } from '../lib/region';
import { wrapFunction } from '../lib/sentry';

const db = admin.firestore();

/**
 * Callable: Re-analyze a trip with Claude AI
 *
 * Input: { tripId: string }
 * Returns: { success: boolean, insightId?: string, error?: string }
 *
 * Auth required. Users can only analyze their own trips.
 */
export const analyzeTripAI = functions
  .region(EUROPE_LONDON)
  .runWith({ secrets: ['ANTHROPIC_API_KEY'] })
  .https.onCall(wrapFunction(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be signed in to request AI analysis.'
    );
  }

  const { tripId } = data;
  if (!tripId || typeof tripId !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'tripId is required and must be a string.'
    );
  }

  const userId = context.auth.uid;

  try {
    // 1. Fetch trip
    const tripDoc = await db.collection(COLLECTION_NAMES.TRIPS).doc(tripId).get();
    if (!tripDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Trip not found.');
    }

    const trip = tripDoc.data() as TripDocument;

    // 2. Authorization: user can only analyze their own trips
    if (trip.userId !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only analyze your own trips.'
      );
    }

    // 3. Trip must be completed
    if (trip.status !== 'completed') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Trip is not completed (status: ${trip.status}).`
      );
    }

    // 4. Rate limit: check if analysis already exists and is recent (< 1 hour)
    const existingInsight = await db
      .collection(COLLECTION_NAMES.TRIP_AI_INSIGHTS)
      .doc(tripId)
      .get();

    if (existingInsight.exists) {
      const insightData = existingInsight.data() as TripAIInsightDocument;
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
      .collection(COLLECTION_NAMES.TRIP_POINTS)
      .doc(tripId)
      .get();

    let points: TripPoint[] = [];
    if (pointsDoc.exists) {
      const pointsData = pointsDoc.data() as TripPointsDocument;
      points = pointsData.points || [];
    }

    // 6. Fetch user profile
    const userDoc = await db.collection(COLLECTION_NAMES.USERS).doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found.');
    }
    const userData = userDoc.data() as UserDocument;

    // 7. Run analysis
    const insightId = await analyzeTrip(tripId, trip, points, userData.drivingProfile);

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
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error(`[AI] On-demand analysis failed for trip ${tripId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'AI analysis failed. Please try again later.'
    );
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
export const getAIInsights = functions
  .region(EUROPE_LONDON)
  .runWith({ secrets: ['ANTHROPIC_API_KEY'] })
  .https.onCall(wrapFunction(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be signed in.'
    );
  }

  const { tripId } = data;
  if (!tripId || typeof tripId !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'tripId is required.'
    );
  }

  const userId = context.auth.uid;

  try {
    const insightDoc = await db
      .collection(COLLECTION_NAMES.TRIP_AI_INSIGHTS)
      .doc(tripId)
      .get();

    if (!insightDoc.exists) {
      return { success: true, insights: null };
    }

    const insights = insightDoc.data() as TripAIInsightDocument;

    // Authorization check
    if (insights.userId !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only view your own trip insights.'
      );
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
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error(`[AI] getAIInsights failed for trip ${tripId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to retrieve AI insights.'
    );
  }
}));
