/**
 * STRIPE → ROOT PLATFORM INTEGRATION GLUE
 * =========================================
 * Firestore trigger that fires when a user's stripeSubscriptionId is set
 * (written by the Express server's Stripe webhook handler after a successful
 * invoice.payment_succeeded event).
 *
 * This Cloud Function then:
 *   1. Checks whether the user already has an active Root policy.
 *   2. If not, retrieves the pending quote for this user and calls acceptInsuranceQuote.
 *   3. Updates the policy's stripeSubscriptionId in Firestore.
 *   4. Sends an FCM push notification: "Your policy is now active."
 *
 * Design note: The Express server cannot call Firebase callable functions
 * directly (they require a Firebase auth context). Instead:
 *   - Stripe webhook → Express server writes { stripeSubscriptionId, pendingQuoteId }
 *     to users/{uid}/pendingPayments/{subscriptionId}
 *   - This trigger fires on that write and calls the Root API
 *
 * ASSUMPTION: stripeSubscriptionId metadata on the Stripe subscription contains
 * a `quoteId` field stored when the checkout was initiated. Until that is
 * implemented in the checkout flow, this function uses the most recent open
 * quote from the `quotes/` collection.
 */
import * as functions from 'firebase-functions';
/**
 * Trigger: fires when a pendingPayment document is created/updated.
 * Path: users/{userId}/pendingPayments/{subscriptionId}
 *
 * This is written by the Express server's Stripe webhook handler when
 * invoice.payment_succeeded fires.
 */
export declare const onPendingPaymentWrite: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
//# sourceMappingURL=payments.d.ts.map