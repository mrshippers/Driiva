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
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = admin.firestore();
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
        // Check if user already has an active policy — avoid duplicates
        const policiesSnap = await db
            .collection(types_1.COLLECTION_NAMES.POLICIES)
            .where('userId', '==', userId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        if (!policiesSnap.empty) {
            functions.logger.info(`[Payments] User ${userId} already has active policy — updating stripeSubscriptionId`);
            const existingPolicy = policiesSnap.docs[0];
            await existingPolicy.ref.update({
                stripeSubscriptionId: subscriptionId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: 'cloud-function',
            });
            await snap.ref.update({
                status: 'completed',
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        functions.logger.info(`[Payments] Policy bound`, { policyId: result.policyId, userId });
        // Send FCM push notification
        const userDoc = await db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).get();
        const user = userDoc.data();
        const fcmTokens = user?.fcmTokens || [];
        if (fcmTokens.length > 0) {
            const message = {
                tokens: fcmTokens,
                notification: {
                    title: 'Your policy is active!',
                    body: `Policy ${result.policyNumber} is now active. Drive safely to earn refunds.`,
                },
                data: {
                    type: 'POLICY_ACTIVATED',
                    policyId: result.policyId,
                    policyNumber: result.policyNumber,
                },
                android: { priority: 'high' },
                apns: { payload: { aps: { sound: 'default' } } },
            };
            const response = await admin.messaging().sendEachForMulticast(message);
            functions.logger.info(`[Payments] FCM sent`, {
                successCount: response.successCount,
                failureCount: response.failureCount,
            });
        }
        await snap.ref.update({
            status: 'completed',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (err) {
        functions.logger.error(`[Payments] Failed to bind policy for user ${userId}:`, err);
        await snap.ref.update({
            status: 'failed',
            error: err.message || 'Unknown error',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
}));
//# sourceMappingURL=payments.js.map