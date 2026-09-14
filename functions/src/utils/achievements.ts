/**
 * ACHIEVEMENTS ENGINE
 * ===================
 * Checks and unlocks achievements based on driving profile and trip data.
 * Called after each trip completion in a non-blocking fire-and-forget manner.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions/v1';
import { ACHIEVEMENT_META } from '@driiva/contracts';
import { DrivingProfileData, TripDocument, COLLECTION_NAMES } from '../types';

const db = getFirestore();

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'safety' | 'community' | 'refund' | 'milestone';
  maxProgress: number | null;
  check: (profile: DrivingProfileData, trip: TripDocument) => boolean;
}

/**
 * The unlock predicates. Metadata (name, description, icon, category,
 * maxProgress) lives in @driiva/contracts so the client can render the
 * catalogue without depending on a seeded Firestore collection; only the
 * decision about what is EARNED lives here, which is authority the client
 * must never hold.
 *
 * Keyed by id and exhaustively checked against the shared catalogue below, so
 * adding a badge to contracts without a predicate fails loudly at module load
 * rather than silently never unlocking for anybody.
 */
const CHECKS: Record<string, (profile: DrivingProfileData, trip: TripDocument) => boolean> = {
  'first-trip': (profile) => profile.totalTrips >= 1,
  'smooth-operator': (profile) => profile.totalTrips >= 10,
  'century-club': (profile) => profile.totalTrips >= 100,
  'high-scorer': (profile) => profile.currentScore >= 90,
  'road-warrior': (profile) => profile.totalMiles >= 500,
  'streak-master': (profile) => profile.streakDays >= 7,
  'night-owl': (_profile, trip) => {
    const startHour = trip.startedAt?.toDate?.()?.getHours?.() ?? 12;
    return startHour >= 21 && trip.score >= 70;
  },
  'perfect-score': (_profile, trip) => trip.score >= 100,
};

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = ACHIEVEMENT_META.map((meta) => {
  const check = CHECKS[meta.id];
  if (!check) {
    throw new Error(
      `[Achievements] "${meta.id}" is in the shared catalogue with no unlock predicate. ` +
        'It would render to users as permanently locked.',
    );
  }
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    icon: meta.icon,
    category: meta.category,
    maxProgress: meta.maxProgress,
    check,
  };
});

/**
 * Check and unlock eligible achievements for a user after a trip.
 * Returns an array of achievement IDs that were newly unlocked.
 */
export async function checkAndUnlockAchievements(
  userId: string,
  profile: DrivingProfileData,
  trip: TripDocument,
  tripId: string,
): Promise<string[]> {
  const userAchRef = db.collection(COLLECTION_NAMES.USERS).doc(userId).collection('achievements');
  const existingSnap = await userAchRef.get();
  const alreadyUnlocked = new Set(existingSnap.docs.map(d => d.id));

  const newlyUnlocked: string[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (alreadyUnlocked.has(def.id)) continue;

    try {
      if (def.check(profile, trip)) {
        await userAchRef.doc(def.id).set({
          achievementId: def.id,
          unlockedAt: FieldValue.serverTimestamp(),
          tripId,
        });
        newlyUnlocked.push(def.id);
      }
    } catch (err) {
      functions.logger.warn(`[Achievements] Error checking ${def.id}:`, err);
    }
  }

  return newlyUnlocked;
}
