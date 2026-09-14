"use strict";
/**
 * ROOT PLATFORM INSURANCE INTEGRATION
 * ====================================
 * Cloud Functions for interacting with the Root Platform insurance API.
 *
 * Root Platform (rootplatform.com) provides programmable insurance infrastructure.
 * This module handles:
 *   1. Generating insurance quotes based on driving scores
 *   2. Creating/retrieving a Root policyholder record (required before applications)
 *   3. Accepting quotes to create policies
 *   4. Retrieving policy details from Root
 *
 * Environment variables (set via Firebase secrets):
 *   ROOT_API_KEY             - Root Platform API key (required)
 *   ROOT_API_URL             - Base URL; defaults to https://api.rootplatform.com/v1/insurance
 *   ROOT_ENVIRONMENT         - "sandbox" | "production"
 *   ROOT_PRODUCT_MODULE_KEY  - Product module key (required, no fallback)
 *
 * All monetary values use integer cents (Root sandbox uses ZAR cents against a
 * UK GBP product - no conversion exists yet, see resolveCurrency() in
 * rootAdapter.ts for the pinned decision, do not guess a rate).
 *
 * M4 Task 4: the Root HTTP transport (quote/bind/sync/cancel) now lives behind
 * the typed RootAdapter interface in ./rootAdapter - see that file for the
 * seam. This file owns the callable functions and Firestore glue only.
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
exports.syncInsurancePolicy = exports.acceptInsuranceQuote = exports.getInsuranceQuote = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const types_1 = require("../types");
const region_1 = require("../lib/region");
const insuranceInternal_1 = require("./insuranceInternal");
const sentry_1 = require("../lib/sentry");
const rootAdapter_1 = require("./rootAdapter");
// Sole concrete RootAdapter instance used by the callables below (M4 Task 4
// seam - see rootAdapter.ts). Structural extraction only; behaviour of the
// underlying HTTP calls is unchanged.
const rootAdapter = new rootAdapter_1.RootHttpAdapter();
// ============================================================================
// COVERAGE TYPE MAPPING
// ============================================================================
function mapCoverageToRootModule(coverageType, drivingScore, totalTrips, totalMiles) {
    return {
        type: 'driiva_telematics',
        coverage_type: coverageType,
        driving_score: Math.round(drivingScore),
        total_trips: totalTrips,
        total_miles: Math.round(totalMiles * 100) / 100,
        discount_factor: Math.max(0, Math.min(30, (drivingScore - 50) * 0.6)),
    };
}
// ============================================================================
// POLICYHOLDER HELPER
// ============================================================================
const db = (0, firestore_1.getFirestore)();
/**
 * The name and email that go onto an insurance record must be the driver's
 * own, or we do not create the record.
 *
 * This used to fall back to first_name "Driver", last_name "Unknown" and
 * `${userId}@driiva.internal`. Because provisioning deliberately writes
 * displayName as null for email/password signups (see provisionUser), that
 * fallback was the COMMON path, not the edge case: the insurer's policyholder
 * register would have filled with people called "Driver Unknown" at an address
 * that accepts no mail. Correspondence an insurer is obliged to send would
 * have gone nowhere, and the identity on the record would have been false.
 *
 * Refusing is the honest failure. It surfaces as "we need your name before we
 * can do this", which is true, actionable, and recoverable.
 */
function requirePolicyholderIdentity(userId, user) {
    const missing = [];
    const nameParts = (user.displayName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ');
    if (!firstName)
        missing.push('your first name');
    if (!lastName)
        missing.push('your last name');
    const email = (user.email || '').trim();
    if (!email)
        missing.push('your email address');
    if (missing.length > 0) {
        functions.logger.warn('[Insurance] refusing to create a policyholder without a real identity', {
            userId,
            missing,
        });
        throw new functions.https.HttpsError('failed-precondition', `We need ${missing.join(' and ')} before we can set up your insurance. Please add it to your profile and try again.`);
    }
    return { firstName, lastName, email };
}
/**
 * Ensure a Root policyholder exists for this user.
 * Stores the Root policyholder_id on the Firestore user document to avoid
 * creating duplicates on subsequent calls.
 */
async function ensurePolicyholder(userId, user) {
    // Return cached ID if we already created one. rootPolicyholderId is written
    // back onto the user document by this function, so it is not part of the
    // canonical UserDocument; named here rather than reached through `any`.
    const cached = user.rootPolicyholderId;
    if (cached) {
        return cached;
    }
    const { firstName, lastName, email } = requirePolicyholderIdentity(userId, user);
    // `email` here is the value requirePolicyholderIdentity() already validated
    // non-empty above (it throws before we reach this line otherwise) - read
    // that, not user.email directly, so this can never fall back to a
    // fabricated @driiva.internal address the way an earlier version of this
    // codebase did elsewhere (see feedback_no_fabricated_fallback_data).
    const policyholder = await rootAdapter.ensurePolicyholder({
        userId,
        firstName,
        lastName,
        email,
    });
    // Cache on Firestore user document (non-critical - if this fails we'll just re-create on next call)
    await db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).update({
        rootPolicyholderId: policyholder.policyholder_id,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }).catch(e => functions.logger.warn('[Insurance] Failed to cache rootPolicyholderId:', e));
    return policyholder.policyholder_id;
}
// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================
/**
 * Generate an insurance quote based on the user's driving score.
 *
 * Input: { coverageType: 'basic' | 'standard' | 'premium' }
 * Output: { quoteId, premiumCents, billingAmountCents, expiresAt, coverageType,
 *            drivingScore, discountPercentage }
 */
exports.getInsuranceQuote = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const userId = context.auth.uid;
    const coverageType = data.coverageType || 'standard';
    if (!['basic', 'standard', 'premium'].includes(coverageType)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid coverage type');
    }
    const userDoc = await db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    const user = userDoc.data();
    const profile = user.drivingProfile;
    if (profile.totalTrips < 1) {
        throw new functions.https.HttpsError('failed-precondition', 'At least 1 completed trip is required to generate a quote');
    }
    functions.logger.info(`[Insurance] Generating quote for user ${userId}`, {
        coverageType,
        drivingScore: profile.currentScore,
        totalTrips: profile.totalTrips,
    });
    const config = (0, rootAdapter_1.getRootConfig)();
    const quoteRequest = {
        type: config.productModuleKey,
        module: mapCoverageToRootModule(coverageType, profile.currentScore, profile.totalTrips, profile.totalMiles),
    };
    const rootQuote = await rootAdapter.quote(quoteRequest);
    // Store quote in Firestore so acceptInsuranceQuote can retrieve coverageType
    await db.collection('quotes').doc(rootQuote.quote_package_id).set({
        quoteId: rootQuote.quote_package_id,
        userId,
        coverageType,
        premiumCents: (0, rootAdapter_1.resolveCurrency)(rootQuote.suggested_premium),
        expiresAt: rootQuote.expiry_date,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    functions.logger.info(`[Insurance] Quote generated`, {
        quoteId: rootQuote.quote_package_id,
        premiumCents: rootQuote.suggested_premium,
    });
    return {
        quoteId: rootQuote.quote_package_id,
        premiumCents: (0, rootAdapter_1.resolveCurrency)(rootQuote.suggested_premium),
        billingAmountCents: (0, rootAdapter_1.resolveCurrency)(rootQuote.billing_amount),
        expiresAt: rootQuote.expiry_date,
        coverageType,
        drivingScore: Math.round(profile.currentScore),
        discountPercentage: Math.round(Math.max(0, Math.min(30, (profile.currentScore - 50) * 0.6))),
    };
}));
/**
 * Accept a quote and bind a policy via Root Platform.
 *
 * Input: { quoteId: string }
 * Output: { policyId, policyNumber, status, monthlyPremiumCents }
 */
exports.acceptInsuranceQuote = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const userId = context.auth.uid;
    const quoteId = data.quoteId;
    if (!quoteId || typeof quoteId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'quoteId is required');
    }
    functions.logger.info(`[Insurance] User ${userId} accepting quote ${quoteId}`);
    // Retrieve stored quote to get coverageType (fixes hardcoded 'standard')
    const quoteDoc = await db.collection('quotes').doc(quoteId).get();
    const storedCoverage = quoteDoc.exists
        ? quoteDoc.data()?.coverageType || 'standard'
        : 'standard';
    // Fetch user profile
    const userDoc = await db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    const user = userDoc.data();
    // Ensure Root policyholder exists (creates one if needed - fixes Firebase UID ≠ policyholder_id)
    const policyholderPackageId = await ensurePolicyholder(userId, user);
    // Create application on Root
    const application = await rootAdapter.bind({
        quote_package_id: quoteId,
        policyholder_id: policyholderPackageId,
    });
    if (!application.policy_id) {
        throw new functions.https.HttpsError('internal', `Root did not return a policy_id. Application status: ${application.status}`);
    }
    // Fetch full policy from Root
    const rootPolicy = await rootAdapter.getPolicy(application.policy_id);
    // Store in Firestore
    const policyData = {
        policyId: rootPolicy.policy_id,
        userId,
        // WAVE H: this used to mint a timestamp-derived reference when the
        // insurer returned none, which matched nothing in their system, and to
        // record the policy as live whatever the insurer reported. Both follow
        // the insurer now.
        policyNumber: rootPolicy.policy_number || null,
        status: (0, insuranceInternal_1.mapRootPolicyStatus)(rootPolicy.status),
        coverageType: storedCoverage,
        // The cover limits used to be hardcoded here too. Root's policy response
        // does not carry them, so we do not know them, so we do not state them.
        coverageDetails: null,
        basePremiumCents: rootPolicy.monthly_premium,
        currentPremiumCents: rootPolicy.monthly_premium,
        discountPercentage: 0,
        effectiveDate: firestore_1.Timestamp.fromDate(new Date(rootPolicy.start_date)),
        expirationDate: firestore_1.Timestamp.fromDate(new Date(rootPolicy.end_date)),
        renewalDate: null,
        vehicle: null,
        billingCycle: 'monthly',
        stripeSubscriptionId: data.stripeSubscriptionId || null,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        createdBy: userId,
        updatedBy: 'cloud-function',
        rootPolicyId: rootPolicy.policy_id,
        rootApplicationId: application.application_id,
    };
    await db.collection(types_1.COLLECTION_NAMES.POLICIES).doc(rootPolicy.policy_id).set(policyData);
    // Update user's activePolicy reference
    await db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).update({
        activePolicy: {
            policyId: rootPolicy.policy_id,
            policyNumber: rootPolicy.policy_number || null,
            status: (0, insuranceInternal_1.mapRootPolicyStatus)(rootPolicy.status),
            startDate: rootPolicy.start_date,
        },
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        updatedBy: 'cloud-function',
    });
    functions.logger.info(`[Insurance] Policy created`, {
        policyId: rootPolicy.policy_id,
        policyNumber: rootPolicy.policy_number,
        userId,
        coverageType: storedCoverage,
    });
    return {
        policyId: rootPolicy.policy_id,
        policyNumber: rootPolicy.policy_number || null,
        status: (0, insuranceInternal_1.mapRootPolicyStatus)(rootPolicy.status),
        monthlyPremiumCents: rootPolicy.monthly_premium,
        startDate: rootPolicy.start_date,
        endDate: rootPolicy.end_date,
    };
}));
/**
 * Fetch the user's current policy status from Root Platform.
 *
 * Input: { policyId: string }
 * Output: Root policy details synced with local Firestore
 */
exports.syncInsurancePolicy = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const userId = context.auth.uid;
    const policyId = data.policyId;
    if (!policyId || typeof policyId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'policyId is required');
    }
    const localPolicy = await db.collection(types_1.COLLECTION_NAMES.POLICIES).doc(policyId).get();
    if (!localPolicy.exists) {
        throw new functions.https.HttpsError('not-found', 'Policy not found');
    }
    const policyData = localPolicy.data();
    if (policyData.userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Not your policy');
    }
    const rootPolicy = await rootAdapter.sync(policyId);
    const rootStatus = rootPolicy.status === 'active' ? 'active'
        : rootPolicy.status === 'cancelled' ? 'cancelled'
            : rootPolicy.status === 'expired' ? 'expired'
                : 'pending';
    await db.collection(types_1.COLLECTION_NAMES.POLICIES).doc(policyId).update({
        status: rootStatus,
        currentPremiumCents: rootPolicy.monthly_premium,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        updatedBy: 'cloud-function',
    });
    functions.logger.info(`[Insurance] Policy ${policyId} synced`, { status: rootStatus });
    return {
        policyId: rootPolicy.policy_id,
        policyNumber: rootPolicy.policy_number,
        status: rootStatus,
        monthlyPremiumCents: rootPolicy.monthly_premium,
        startDate: rootPolicy.start_date,
        endDate: rootPolicy.end_date,
    };
}));
//# sourceMappingURL=insurance.js.map