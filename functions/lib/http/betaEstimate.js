"use strict";
/**
 * BETA ESTIMATE CLOUD FUNCTIONS
 * =============================
 * Callable: calculateBetaEstimateForUser – recompute and write beta pricing doc.
 * Trigger: onUserOrPoolUpdate – keep estimate in sync when user or pool changes.
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
exports.onUserUpdateRecalcBetaEstimate = exports.calculateBetaEstimateForUser = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const index_1 = require("../index");
const types_1 = require("../types");
const betaEstimateService_1 = require("../lib/betaEstimateService");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const Timestamp = admin.firestore.Timestamp;
const FieldValue = admin.firestore.FieldValue;
const BETA_PRICING_SUBCOLLECTION = 'betaPricing';
const BETA_ESTIMATE_DOC_ID = 'currentEstimate';
const POOL_DOC_ID = 'current';
/**
 * Get community pool safety factor (0–1). Default 0.5 if pool missing.
 */
async function getCommunityPoolSafety() {
    const poolSnap = await index_1.db
        .collection(types_1.COLLECTION_NAMES.COMMUNITY_POOL)
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
exports.calculateBetaEstimateForUser = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const userId = (data?.userId ?? context.auth.uid);
    if (userId !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'Can only calculate estimate for yourself');
    }
    const userSnap = await index_1.db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).get();
    if (!userSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    const user = userSnap.data();
    const personalScore = user.drivingProfile?.currentScore ?? 0;
    const age = user.age;
    const postcode = user.postcode;
    const communityPoolSafety = await getCommunityPoolSafety();
    const result = (0, betaEstimateService_1.calculateBetaEstimate)({
        personalScore,
        age: age ?? undefined,
        postcode: postcode ?? undefined,
        communityPoolSafety,
    });
    if (!result) {
        return {
            success: false,
            message: 'Missing age or postcode. Add them in your profile to see a beta estimate.',
        };
    }
    const now = Timestamp.now();
    const estimateData = {
        ...result,
        personalScore,
        age: user.age,
        postcode: user.postcode ?? '',
        communityPoolSafety,
        version: betaEstimateService_1.BETA_ESTIMATE_VERSION,
        createdAt: now,
        updatedAt: now,
    };
    const estimateRef = index_1.db
        .collection(types_1.COLLECTION_NAMES.USERS)
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
}));
/**
 * When user profile (or pool) changes, recompute beta estimate and upsert.
 * Runs on user document update so estimate stays in sync with score, age, postcode.
 */
exports.onUserUpdateRecalcBetaEstimate = functions
    .region(region_1.EUROPE_LONDON)
    .firestore
    .document(`${types_1.COLLECTION_NAMES.USERS}/{userId}`)
    .onUpdate((0, sentry_1.wrapTrigger)(async (change, context) => {
    const userId = context.params.userId;
    const after = change.after.data();
    const personalScore = after.drivingProfile?.currentScore ?? 0;
    const age = after.age;
    const postcode = after.postcode;
    if (age == null || postcode == null || String(postcode).trim() === '') {
        return;
    }
    const communityPoolSafety = await getCommunityPoolSafety();
    const result = (0, betaEstimateService_1.calculateBetaEstimate)({
        personalScore,
        age,
        postcode,
        communityPoolSafety,
    });
    if (!result)
        return;
    const estimateRef = index_1.db
        .collection(types_1.COLLECTION_NAMES.USERS)
        .doc(userId)
        .collection(BETA_PRICING_SUBCOLLECTION)
        .doc(BETA_ESTIMATE_DOC_ID);
    await estimateRef.set({
        ...result,
        personalScore,
        age: after.age,
        postcode: after.postcode ?? '',
        communityPoolSafety,
        version: betaEstimateService_1.BETA_ESTIMATE_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    functions.logger.info('[BetaEstimate] Trigger updated estimate for user', {
        userId,
        estimatedPremium: result.estimatedPremium,
    });
}));
//# sourceMappingURL=betaEstimate.js.map