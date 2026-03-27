"use strict";
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
exports.onPolicyWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = admin.firestore();
exports.onPolicyWrite = functions
    .region(region_1.EUROPE_LONDON)
    .firestore
    .document(`${types_1.COLLECTION_NAMES.POLICIES}/{policyId}`)
    .onWrite((0, sentry_1.wrapTrigger)(async (change, context) => {
    const { policyId } = context.params;
    // Document deleted — clear activePolicy on user
    if (!change.after.exists) {
        const before = change.before.data();
        if (!before?.userId)
            return null;
        functions.logger.info(`Policy ${policyId} deleted — clearing activePolicy for user ${before.userId}`);
        await db
            .collection(types_1.COLLECTION_NAMES.USERS)
            .doc(before.userId)
            .update({
            activePolicy: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'system:onPolicyWrite',
        });
        return null;
    }
    const policy = change.after.data();
    if (!policy?.userId) {
        functions.logger.warn(`Policy ${policyId} has no userId — skipping sync`);
        return null;
    }
    // Policies that are cancelled/expired clear the activePolicy summary
    if (policy.status === 'cancelled' || policy.status === 'expired') {
        functions.logger.info(`Policy ${policyId} is ${policy.status} — clearing activePolicy for user ${policy.userId}`);
        await db
            .collection(types_1.COLLECTION_NAMES.USERS)
            .doc(policy.userId)
            .update({
            activePolicy: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'system:onPolicyWrite',
        });
        return null;
    }
    // Active / pending / suspended — sync summary to user document
    const activePolicy = {
        policyId: policy.policyId,
        policyNumber: policy.policyNumber, // ← was missing, caused CI failure
        status: policy.status,
        premiumCents: policy.currentPremiumCents,
        coverageType: policy.coverageType,
        renewalDate: policy.renewalDate ?? policy.expirationDate,
    };
    functions.logger.info(`Syncing policy ${policyId} (${policy.policyNumber}) to user ${policy.userId}`);
    await db
        .collection(types_1.COLLECTION_NAMES.USERS)
        .doc(policy.userId)
        .update({
        activePolicy,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'system:onPolicyWrite',
    });
    return null;
}));
//# sourceMappingURL=policies.js.map