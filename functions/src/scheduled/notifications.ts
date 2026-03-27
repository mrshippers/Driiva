/**
 * SCHEDULED NOTIFICATIONS
 * =======================
 * Sends weekly driving summary push notifications every Monday at 9am UK time.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION_NAMES, UserDocument } from '../types';
import { sendWeeklySummaryToUser } from '../utils/notifications';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';

const db = admin.firestore();

/**
 * Send weekly driving summary to all active users.
 * Runs every Monday at 9:00 AM UK time.
 */
export const sendWeeklySummary = functions
  .region(EUROPE_LONDON)
  .pubsub.schedule('0 9 * * 1') // Every Monday 9 AM
  .timeZone('Europe/London')
  .onRun(wrapTrigger(async () => {
    functions.logger.info('[WeeklySummary] Starting weekly summary notifications');

    try {
      const usersSnap = await db
        .collection(COLLECTION_NAMES.USERS)
        .where('settings.notificationsEnabled', '==', true)
        .get();

      let sent = 0;
      let skipped = 0;

      for (const userDoc of usersSnap.docs) {
        const user = userDoc.data() as UserDocument;
        const profile = user.drivingProfile;

        if (!profile || profile.totalTrips === 0 || !user.fcmTokens?.length) {
          skipped++;
          continue;
        }

        try {
          await sendWeeklySummaryToUser(
            userDoc.id,
            Math.round(profile.currentScore),
            profile.totalTrips,
            Math.round(profile.totalMiles),
          );
          sent++;
        } catch (err) {
          functions.logger.warn(`[WeeklySummary] Failed for user ${userDoc.id}:`, err);
        }
      }

      functions.logger.info(`[WeeklySummary] Done: ${sent} sent, ${skipped} skipped`);
    } catch (err) {
      functions.logger.error('[WeeklySummary] Fatal error:', err);
      throw err;
    }
  }));
