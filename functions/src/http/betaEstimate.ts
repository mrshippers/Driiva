/**
 * BETA ESTIMATE CLOUD FUNCTIONS
 * =============================
 * Callable: calculateBetaEstimateForUser – recompute and write beta pricing doc.
 * Trigger: onUserOrPoolUpdate – keep estimate in sync when user or pool changes.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { db } from '../index';
import { COLLECTION_NAMES } from '../types';
import type { UserDocument } from '../types';
import {
  calculateBetaEstimate,
  BETA_ESTIMATE_VERSION,
} from '../lib/betaEstimateService';
import { EUROPE_LONDON } from '../lib/region';
import { wrapFunction, wrapTrigger } from '../lib/sentry';

const Timestamp = admin.firestore.Timestamp;
const FieldValue = admin.firestore.FieldValue;

const BETA_PRICING_SUBCOLLECTION = 'betaPricing';
const BETA_ESTIMATE_DOC_ID = 'currentEstimate';
const POOL_DOC_ID = 'current';

/**
 * Get community pool safety factor (0–1). Default 0.5 if pool missing.
 */
async function getCommunityPoolSafety(): Promise<number> {
  const poolSnap = await db
    .collection(COLLECTION_NAMES.COMMUNITY_POOL)
    .doc(POOL_DOC_ID)
    .get();
  const data = poolSnap.data();
  const safety = data?.safetyFactor;
  if (typeof safety === 'number' && safety >= 0 && safety <= 1) {
    return safety;
  }
  return 0.5;
}

/**
 * Recompute beta estimate for a user and write to users/{userId}/betaPricing/currentEstimate.
 * Callable by the authenticated user for their own userId (or pass no arg = use context.auth.uid).
 */
export const calculateBetaEstimateForUser = functions
  .region(EUROPE_LONDON)
  .https.onCall(wrapFunction(
  async (data: { userId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const userId = (data?.userId ?? context.auth.uid) as string;
    if (userId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Can only calculate estimate for yourself'
      );
    }

    const userSnap = await db.collection(COLLECTION_NAMES.USERS).doc(userId).get();
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }

    const user = userSnap.data() as UserDocument;
    const personalScore = user.drivingProfile?.currentScore ?? 0;
    const age = user.age;
    const postcode = user.postcode;
    const communityPoolSafety = await getCommunityPoolSafety();

    const result = calculateBetaEstimate({
      personalScore,
      age: age ?? undefined,
      postcode: postcode ?? undefined,
      communityPoolSafety,
    });

    if (!result) {
      return {
        success: false,
        message:
          'Missing age or postcode. Add them in your profile to see a beta estimate.',
      };
    }

    const now = Timestamp.now();
    const estimateData = {
      ...result,
      personalScore,
      age: user.age,
      postcode: user.postcode ?? '',
      communityPoolSafety,
      version: BETA_ESTIMATE_VERSION,
      createdAt: now,
      updatedAt: now,
    };

    const estimateRef = db
      .collection(COLLECTION_NAMES.USERS)
      .doc(userId)
      .collection(BETA_PRICING_SUBCOLLECTION)
      .doc(BETA_ESTIMATE_DOC_ID);

    await estimateRef.set(estimateData);

    functions.logger.info('[BetaEstimate] Updated estimate for user', {
      userId,
      estimatedPremium: result.estimatedPremium,
    });

    return {
      success: true,
      estimate: result,
    };
  }
));

/**
 * When user profile (or pool) changes, recompute beta estimate and upsert.
 * Runs on user document update so estimate stays in sync with score, age, postcode.
 */
export const onUserUpdateRecalcBetaEstimate = functions
  .region(EUROPE_LONDON)
  .firestore
  .document(`${COLLECTION_NAMES.USERS}/{userId}`)
  .onUpdate(wrapTrigger(async (change, context) => {
    const userId = context.params.userId as string;
    const after = change.after.data() as UserDocument;

    const personalScore = after.drivingProfile?.currentScore ?? 0;
    const age = after.age;
    const postcode = after.postcode;

    if (age == null || postcode == null || String(postcode).trim() === '') {
      return;
    }

    const communityPoolSafety = await getCommunityPoolSafety();
    const result = calculateBetaEstimate({
      personalScore,
      age,
      postcode,
      communityPoolSafety,
    });

    if (!result) return;

    const estimateRef = db
      .collection(COLLECTION_NAMES.USERS)
      .doc(userId)
      .collection(BETA_PRICING_SUBCOLLECTION)
      .doc(BETA_ESTIMATE_DOC_ID);

    await estimateRef.set(
      {
        ...result,
        personalScore,
        age: after.age,
        postcode: after.postcode ?? '',
        communityPoolSafety,
        version: BETA_ESTIMATE_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    functions.logger.info('[BetaEstimate] Trigger updated estimate for user', {
      userId,
      estimatedPremium: result.estimatedPremium,
    });
  }));
