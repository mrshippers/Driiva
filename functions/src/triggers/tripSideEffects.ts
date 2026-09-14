/**
 * The fire-and-forget work that hangs off a completed trip: the DPIA field
 * audit, the stop-go classifier, the Claude analysis and the achievement
 * check. Each is deliberately not awaited by the trigger, so a failure here
 * never fails the trip write. Extracted verbatim from
 * functions/src/triggers/trips.ts.
 */
import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import {
  COLLECTION_NAMES,
  TripDocument,
  TripPoint,
  UserDocument,
  DrivingProfileData,
} from '../types';
import { checkAndUnlockAchievements, ACHIEVEMENT_DEFINITIONS } from '../utils/achievements';
import { notifyTripComplete, notifyAchievementsUnlocked } from '../utils/notifications';
import { classifyCompletedTrip } from '../http/classifier';
import { analyzeTrip } from '../ai/tripAnalysis';
import { db } from '../lib/db';

// ─── DPIA SAFEGUARD ─────────────────────────────────────────────────────────
// Approved data fields for trip point processing. Any new field types added to
// tripPoints documents that aren't in this list will trigger a warning log and
// a Firestore flag at admin/dpiaAlerts. This is an architectural safeguard for
// future GDPR compliance - trips still process normally.
//
// Before adding new sensor types to trip collection, a Data Protection Impact
// Assessment (DPIA) must be completed per UK GDPR Art. 35 for high-risk
// processing of location/behavioural data at scale.
const DPIA_REVIEWED_DATA_TYPES = new Set([
  't', 'lat', 'lng', 'spd', 'hdg', 'acc',   // Core GPS fields
  'ax', 'ay', 'az',                           // Accelerometer
  'gx', 'gy', 'gz',                           // Gyroscope
]);

/**
 * Non-blocking check: flag any unreviewed data types in trip points.
 * Writes an alert to admin/dpiaAlerts if new fields are detected.
 */
export async function checkDpiaCompliance(tripId: string, points: unknown[]): Promise<void> {
  if (!points.length) return;
  const sample = points[0] as Record<string, unknown>;
  const unreviewedFields = Object.keys(sample).filter(
    (key) => !DPIA_REVIEWED_DATA_TYPES.has(key),
  );

  if (unreviewedFields.length > 0) {
    functions.logger.warn('DPIA REVIEW REQUIRED: new data type detected in trip points', {
      tripId,
      fields: unreviewedFields,
    });

    try {
      const alertRef = db.collection('admin').doc('dpiaAlerts');
      await alertRef.set(
        {
          lastAlertAt: FieldValue.serverTimestamp(),
          unreviewedFields: FieldValue.arrayUnion(...unreviewedFields),
          [`alerts.${tripId}`]: {
            fields: unreviewedFields,
            detectedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );
    } catch (err) {
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
export function classifyCompletedTripAsync(tripId: string, trip: TripDocument): void {
  // Fire and forget - don't await
  classifyCompletedTrip(tripId, trip)
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
export function isAIInsightsEnabled(): boolean {
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
export function analyzeCompletedTripAsync(
  tripId: string,
  trip: TripDocument,
  points: TripPoint[],
  profile: DrivingProfileData,
): void {
  if (!isAIInsightsEnabled()) {
    functions.logger.info(`[AI] Feature flag disabled, skipping analysis for trip ${tripId}`);
    return;
  }

  analyzeTrip(tripId, trip, points, profile)
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
export function checkAchievementsAsync(userId: string, trip: TripDocument, tripId: string): void {
  (async () => {
    try {
      // Send trip-complete push notification
      notifyTripComplete(userId, tripId, trip.score).catch(err =>
        functions.logger.warn(`[Push] Trip-complete notification error:`, err),
      );

      // Check & unlock achievements
      const userDoc = await db.collection(COLLECTION_NAMES.USERS).doc(userId).get();
      if (!userDoc.exists) return;
      const profile = (userDoc.data() as UserDocument).drivingProfile;
      const unlocked = await checkAndUnlockAchievements(userId, profile, trip, tripId);

      if (unlocked.length > 0) {
        functions.logger.info(`[Achievements] Unlocked ${unlocked.length} for user ${userId}: ${unlocked.join(', ')}`);
        const names = unlocked
          .map(id => ACHIEVEMENT_DEFINITIONS.find(d => d.id === id)?.name)
          .filter(Boolean) as string[];
        notifyAchievementsUnlocked(userId, names).catch(err =>
          functions.logger.warn(`[Push] Achievement notification error:`, err),
        );
      }
    } catch (err) {
      functions.logger.warn(`[Achievements] Non-blocking error for user ${userId}:`, err);
    }
  })();
}
