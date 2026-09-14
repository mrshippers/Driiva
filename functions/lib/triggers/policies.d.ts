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
export declare const onPolicyWrite: functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>>;
//# sourceMappingURL=policies.d.ts.map