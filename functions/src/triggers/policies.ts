/**
 * POLICY TRIGGER
 * ==============
 * Syncs policy data to the user document when a policy is created or updated.
 *
 * onPolicyWrite:
 *   - On create/update: if policy is active, write ActivePolicySummary to
 *     users/{userId}.activePolicy
 *   - On delete or cancelled/expired: clear users/{userId}.activePolicy
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { PolicyDocument, ActivePolicySummary, COLLECTION_NAMES } from '../types';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';

const db = admin.firestore();

export const onPolicyWrite = functions
  .region(EUROPE_LONDON)
  .firestore
  .document(`${COLLECTION_NAMES.POLICIES}/{policyId}`)
  .onWrite(wrapTrigger(async (change, context) => {
    const { policyId } = context.params;

    // Document deleted — clear activePolicy on user
    if (!change.after.exists) {
      const before = change.before.data() as PolicyDocument | undefined;
      if (!before?.userId) return null;

      functions.logger.info(`Policy ${policyId} deleted — clearing activePolicy for user ${before.userId}`);

      await db
        .collection(COLLECTION_NAMES.USERS)
        .doc(before.userId)
        .update({
          activePolicy: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: 'system:onPolicyWrite',
        });

      return null;
    }

    const policy = change.after.data() as PolicyDocument;

    if (!policy?.userId) {
      functions.logger.warn(`Policy ${policyId} has no userId — skipping sync`);
      return null;
    }

    // Policies that are cancelled/expired clear the activePolicy summary
    if (policy.status === 'cancelled' || policy.status === 'expired') {
      functions.logger.info(
        `Policy ${policyId} is ${policy.status} — clearing activePolicy for user ${policy.userId}`
      );

      await db
        .collection(COLLECTION_NAMES.USERS)
        .doc(policy.userId)
        .update({
          activePolicy: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: 'system:onPolicyWrite',
        });

      return null;
    }

    // Active / pending / suspended — sync summary to user document
    const activePolicy: ActivePolicySummary = {
      policyId: policy.policyId,
      policyNumber: policy.policyNumber,       // ← was missing, caused CI failure
      status: policy.status,
      premiumCents: policy.currentPremiumCents,
      coverageType: policy.coverageType,
      renewalDate: policy.renewalDate ?? policy.expirationDate,
    };

    functions.logger.info(
      `Syncing policy ${policyId} (${policy.policyNumber}) to user ${policy.userId}`
    );

    await db
      .collection(COLLECTION_NAMES.USERS)
      .doc(policy.userId)
      .update({
        activePolicy,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'system:onPolicyWrite',
      });

    return null;
  }));
