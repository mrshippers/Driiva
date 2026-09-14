"use strict";
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
 *   4. Tells the driver what actually happened: cover confirmed, cover still
 *      pending, or payment taken with no cover in place. Never a blanket
 *      "your policy is active" on the strength of a card having cleared.
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPendingPaymentWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const types_1 = require("../types");
const notifications_1 = require("../utils/notifications");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = (0, firestore_1.getFirestore)();
/**
 * Trigger: fires when a pendingPayment document is created/updated.
 * Path: users/{userId}/pendingPayments/{subscriptionId}
 *
 * This is written by the Express server's Stripe webhook handler when
 * invoice.payment_succeeded fires.
 */
exports.onPendingPaymentWrite = functions
    .region(region_1.EUROPE_LONDON)
    .firestore
    .document('users/{userId}/pendingPayments/{subscriptionId}')
    .onCreate((0, sentry_1.wrapTrigger)(async (snap, context) => {
    const { userId, subscriptionId } = context.params;
    const data = snap.data();
    if (data.status !== 'pending')
        return;
    functions.logger.info(`[Payments] Processing pending payment for user ${userId}`, {
        subscriptionId,
        quoteId: data.quoteId,
    });
    // Mark as processing
    await snap.ref.update({ status: 'processing' });
    try {
        // Check if user already has an active policy - avoid duplicates
        const policiesSnap = await db
            .collection(types_1.COLLECTION_NAMES.POLICIES)
            .where('userId', '==', userId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        if (!policiesSnap.empty) {
            functions.logger.info(`[Payments] User ${userId} already has active policy - updating stripeSubscriptionId`);
            const existingPolicy = policiesSnap.docs[0];
            await existingPolicy.ref.update({
                stripeSubscriptionId: subscriptionId,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedBy: 'cloud-function',
            });
            await snap.ref.update({
                status: 'completed',
                policyId: existingPolicy.id,
                policyStatus: 'active',
                processedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return;
        }
        // Find the quote to bind
        let quoteId = data.quoteId;
        if (!quoteId) {
            // Fall back: find most recent unexpired quote for this user
            const quotesSnap = await db
                .collection('quotes')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();
            if (quotesSnap.empty) {
                throw new Error(`No quote found for user ${userId}`);
            }
            quoteId = quotesSnap.docs[0].id;
        }
        functions.logger.info(`[Payments] Binding Root policy for user ${userId} with quote ${quoteId}`);
        // Call acceptInsuranceQuote logic directly (same code as the callable function
        // to avoid a cross-function HTTP call, which would require a service URL)
        const { acceptInsuranceQuoteInternal } = await Promise.resolve().then(() => __importStar(require('../http/insuranceInternal')));
        const result = await acceptInsuranceQuoteInternal(userId, quoteId, subscriptionId);
        functions.logger.info(`[Payments] Root returned a policy`, {
            policyId: result.policyId,
            status: result.status,
            userId,
        });
        // What the driver is told follows what the insurer said, not the fact
        // that a card cleared. This used to push "Your policy is active!" with
        // an invented policy number on every path that reached this line,
        // including the paths where Root had not activated anything.
        if (result.status === 'active') {
            await (0, notifications_1.notifyPolicyConfirmed)(userId, result.policyId, result.policyNumber);
        }
        else {
            await (0, notifications_1.notifyPolicyNotConfirmed)(userId, 'pending');
        }
        await snap.ref.update({
            // 'completed' means this binding attempt finished, not that cover is
            // in place. `policyStatus` is the part that says whether it is.
            status: 'completed',
            policyId: result.policyId,
            policyStatus: result.status,
            processedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    catch (err) {
        // MONEY HAS BEEN TAKEN AND THERE IS NO COVER. Previously this wrote a
        // status nobody surfaced and logged a line nobody read, while the
        // checkout screen told the driver their policy was active. The failure
        // is now recorded AND told to the person it happened to.
        functions.logger.error(`[Payments] Failed to bind policy for user ${userId}:`, err);
        await snap.ref.update({
            status: 'failed',
            policyStatus: 'none',
            error: err instanceof Error && err.message ? err.message : 'Unknown error',
            processedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        try {
            await (0, notifications_1.notifyPolicyNotConfirmed)(userId, 'failed');
        }
        catch (notifyErr) {
            functions.logger.error('[Payments] could not notify the user of a bind failure:', notifyErr);
        }
    }
}));
//# sourceMappingURL=payments.js.map