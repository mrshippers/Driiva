"use strict";
/**
 * POOL SHARE TRIGGERS
 * ===================
 * Cloud Functions triggered by pool share document changes.
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
exports.onPoolShareWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = admin.firestore();
/**
 * Triggered when a pool share is created or updated
 * Syncs pool share summary to user document
 */
exports.onPoolShareWrite = functions
    .region(region_1.EUROPE_LONDON)
    .firestore
    .document(`${types_1.COLLECTION_NAMES.POOL_SHARES}/{shareId}`)
    .onWrite((0, sentry_1.wrapTrigger)(async (change, context) => {
    const shareId = context.params.shareId;
    // Handle deletion
    if (!change.after.exists) {
        functions.logger.info(`Pool share ${shareId} deleted`);
        return;
    }
    const share = change.after.data();
    // Only sync active shares from current period
    if (share.status !== 'active') {
        functions.logger.info(`Skipping sync for non-active share ${shareId}`);
        return;
    }
    functions.logger.info(`Pool share ${shareId} changed`, {
        userId: share.userId,
        contributionCents: share.contributionCents,
        projectedRefundCents: share.projectedRefundCents,
    });
    try {
        const userRef = db.collection(types_1.COLLECTION_NAMES.USERS).doc(share.userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            functions.logger.warn(`User ${share.userId} not found for share ${shareId}`);
            return;
        }
        // Build pool share summary (use share.updatedAt so denormalized lastUpdatedAt stays in sync)
        const poolShareSummary = {
            currentShareCents: share.projectedRefundCents,
            contributionCents: share.contributionCents,
            sharePercentage: Math.round(share.sharePercentage * 100) / 100, // 2 decimal places
            lastUpdatedAt: share.updatedAt ?? admin.firestore.Timestamp.now(),
        };
        await userRef.update({
            poolShare: poolShareSummary,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'cloud-function',
        });
        functions.logger.info(`Synced pool share to user ${share.userId}`, {
            currentShareCents: poolShareSummary.currentShareCents,
            sharePercentage: poolShareSummary.sharePercentage,
        });
    }
    catch (error) {
        functions.logger.error(`Error syncing pool share ${shareId}:`, error);
        throw error;
    }
}));
//# sourceMappingURL=pool.js.map