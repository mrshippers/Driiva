/**
 * USER TRIGGERS
 * =============
 * Cloud Functions triggered by user document changes.
 *
 * onUserCreate: Auto-create a default policy for new users.
 * This ensures every registered user has an active policy from day one.
 */
import * as functions from 'firebase-functions';
/**
 * Triggered when a new user document is created in Firestore.
 *
 * Actions:
 *   1. Checks if the user already has an active policy (idempotency)
 *   2. Creates a default 'pending' policy with standard coverage
 *   3. Links the policy reference back to the user document
 *   4. Auto-promotes to admin if email is in ADMIN_EMAILS env var
 *
 * Notes:
 *   - Policy status starts as 'pending' (not 'active') until payment/quote is confirmed
 *   - Premium defaults to 0 cents until a quote is generated
 *   - Uses integer cents for all financial fields (never floats)
 */
export declare const onUserCreate: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
//# sourceMappingURL=users.d.ts.map