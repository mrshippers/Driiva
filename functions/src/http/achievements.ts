/**
 * ACHIEVEMENTS HTTP CALLABLE
 * ==========================
 * Admin-only callable to seed achievement definitions into Firestore.
 */

import * as functions from 'firebase-functions/v1';
import { getFirestore } from 'firebase-admin/firestore';
import { ACHIEVEMENT_DEFINITIONS } from '../utils/achievements';
import { EUROPE_LONDON } from '../lib/region';
import { wrapFunction } from '../lib/sentry';

const db = getFirestore();

/**
 * Seed achievement definitions into the top-level `achievements` collection.
 * Callable by admin users only. Idempotent (overwrites existing docs by ID).
 */
export const seedAchievements = functions
  .region(EUROPE_LONDON)
  .https.onCall(wrapFunction(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }

    /*
     * This function's own docstring says "Callable by admin users only" and
     * the code checked nothing but the presence of a session, so any signed-in
     * user could rewrite the achievement catalogue every other user reads.
     * The gap between the comment and the check is why it survived review.
     */
    const callerDoc = await db.collection('users').doc(context.auth.uid).get();
    if (callerDoc.data()?.isAdmin !== true) {
      functions.logger.warn('[seedAchievements] non-admin attempt', { uid: context.auth.uid });
      throw new functions.https.HttpsError('permission-denied', 'Admins only.');
    }

    const batch = db.batch();
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const ref = db.collection('achievements').doc(def.id);
      batch.set(ref, {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        maxProgress: def.maxProgress,
      });
    }

    await batch.commit();
    functions.logger.info(`[seedAchievements] Seeded ${ACHIEVEMENT_DEFINITIONS.length} definitions`);
    return { seeded: ACHIEVEMENT_DEFINITIONS.length };
  }));
