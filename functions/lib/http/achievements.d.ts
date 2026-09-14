/**
 * ACHIEVEMENTS HTTP CALLABLE
 * ==========================
 * Admin-only callable to seed achievement definitions into Firestore.
 */
import * as functions from 'firebase-functions';
/**
 * Seed achievement definitions into the top-level `achievements` collection.
 * Callable by admin users only. Idempotent (overwrites existing docs by ID).
 */
export declare const seedAchievements: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=achievements.d.ts.map