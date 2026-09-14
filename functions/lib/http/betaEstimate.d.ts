/**
 * BETA ESTIMATE CLOUD FUNCTIONS
 * =============================
 * Callable: calculateBetaEstimateForUser - recompute and write beta pricing doc.
 * Trigger: onUserOrPoolUpdate - keep estimate in sync when user or pool changes.
 */
import * as functions from 'firebase-functions';
/**
 * Recompute beta estimate for a user and write to users/{userId}/betaPricing/currentEstimate.
 * Callable by the authenticated user for their own userId (or pass no arg = use context.auth.uid).
 */
export declare const calculateBetaEstimateForUser: functions.HttpsFunction & functions.Runnable<any>;
/**
 * When user profile (or pool) changes, recompute beta estimate and upsert.
 * Runs on user document update so estimate stays in sync with score, age, postcode.
 */
export declare const onUserUpdateRecalcBetaEstimate: functions.CloudFunction<functions.Change<functions.firestore.QueryDocumentSnapshot>>;
//# sourceMappingURL=betaEstimate.d.ts.map