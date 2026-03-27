"use strict";
/**
 * ADMIN & CALLABLE HTTP FUNCTIONS
 * ================================
 * HTTP callable functions for admin operations and
 * client operations that require admin SDK (writes to protected collections).
 *
 * All callables use shared auth: requireAuth (401 if missing/expired token),
 * requireSelf or requireAdmin for authorization (403 if not allowed).
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
exports.addPoolContribution = exports.cancelTrip = exports.initializePool = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const helpers_1 = require("../utils/helpers");
const auth_1 = require("./auth");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = admin.firestore();
/**
 * Initialize community pool (admin only)
 * Call this once to set up the pool document
 */
exports.initializePool = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    (0, auth_1.requireAuth)(context);
    (0, auth_1.requireAdmin)(context);
    // TODO: Rate limiting – e.g. allow at most 1 initializePool per project per hour
    // Example: check Firestore or Redis for last call timestamp by context.auth.uid
    const poolRef = db.collection(types_1.COLLECTION_NAMES.COMMUNITY_POOL).doc('current');
    const existingPool = await poolRef.get();
    if (existingPool.exists && !data?.force) {
        throw new functions.https.HttpsError('already-exists', 'Community pool already initialized. Pass force: true to reinitialize.');
    }
    const periodType = data?.periodType || 'monthly';
    const { start, end } = getPoolPeriodDates(periodType);
    const now = admin.firestore.Timestamp.now();
    const poolData = {
        poolId: 'current',
        totalPoolCents: 0,
        totalContributionsCents: 0,
        totalPayoutsCents: 0,
        reserveCents: 0,
        activeParticipants: 0,
        totalParticipantsEver: 0,
        averagePoolScore: 100,
        safetyFactor: 1.0,
        claimsThisPeriod: 0,
        periodStart: start,
        periodEnd: end,
        periodType,
        projectedRefundRate: 0.15, // 15% default
        lastCalculatedAt: now,
        version: 1,
    };
    await poolRef.set(poolData);
    functions.logger.info('Community pool initialized', { periodType });
    return {
        success: true,
        message: 'Community pool initialized',
        pool: {
            periodType,
            periodStart: start.toDate().toISOString(),
            periodEnd: end.toDate().toISOString(),
        },
    };
}));
/**
 * Get pool period date range
 */
function getPoolPeriodDates(periodType) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let startDate;
    let endDate;
    if (periodType === 'monthly') {
        startDate = new Date(year, month, 1);
        endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    }
    else {
        const quarter = Math.floor(month / 3);
        startDate = new Date(year, quarter * 3, 1);
        endDate = new Date(year, (quarter + 1) * 3, 0, 23, 59, 59, 999);
    }
    return {
        start: admin.firestore.Timestamp.fromDate(startDate),
        end: admin.firestore.Timestamp.fromDate(endDate),
    };
}
// ============================================================================
// TRIP OPERATIONS (Callable by authenticated users)
// ============================================================================
/**
 * Cancel a trip (mark as failed)
 *
 * This is a callable function because:
 * - Trip documents cannot be updated by clients (security rules: allow update: if false)
 * - Only the admin SDK can update trip status
 */
exports.cancelTrip = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    const userId = (0, auth_1.requireAuth)(context);
    // TODO: Rate limiting – e.g. max N cancelTrip calls per user per minute
    // Example: increment counter in Firestore/Redis keyed by userId, reject if over threshold
    const tripId = data?.tripId;
    // Validate input
    if (typeof tripId !== 'string' || tripId.trim() === '') {
        throw new functions.https.HttpsError('invalid-argument', 'tripId must be a non-empty string');
    }
    functions.logger.info('Processing trip cancellation', {
        userId,
        tripId,
    });
    try {
        const tripRef = db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId);
        const tripDoc = await tripRef.get();
        if (!tripDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Trip not found');
        }
        const tripData = tripDoc.data();
        // Verify ownership
        if (tripData?.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'You can only cancel your own trips');
        }
        // Only allow cancellation of trips in 'processing' status
        if (tripData?.status !== 'processing') {
            throw new functions.https.HttpsError('failed-precondition', `Cannot cancel trip with status '${tripData?.status}'. Only trips with status 'processing' can be cancelled.`);
        }
        // Update trip status to failed
        await tripRef.update({
            status: 'failed',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.info('Trip cancelled successfully', {
            userId,
            tripId,
        });
        return {
            success: true,
            tripId,
            message: 'Trip cancelled successfully',
        };
    }
    catch (error) {
        functions.logger.error('Trip cancellation failed', { userId, tripId, error });
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        // Expired token: requireAuth() already throws unauthenticated with sign-in-again message
        throw new functions.https.HttpsError('internal', 'Failed to cancel trip');
    }
}));
// ============================================================================
// POOL CONTRIBUTION (Callable by authenticated users)
// ============================================================================
/**
 * Add contribution to pool (called after payment is processed)
 *
 * This is a callable function because:
 * - communityPool and poolShares collections require admin SDK to write
 * - Client-side security rules prevent direct writes to these collections
 * - This ensures atomic, transactional updates across multiple collections
 *
 * Authorization: userId is always context.auth.uid (no client-supplied userId).
 */
exports.addPoolContribution = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    const userId = (0, auth_1.requireAuth)(context);
    // TODO: Rate limiting – e.g. max N contributions per user per day, or per amount
    // Example: check Firestore/Redis for count in current period for userId
    const amountCents = data?.amountCents;
    // Validate input
    if (typeof amountCents !== 'number' || amountCents <= 0 || !Number.isInteger(amountCents)) {
        throw new functions.https.HttpsError('invalid-argument', 'amountCents must be a positive integer');
    }
    // Maximum single contribution limit (e.g., $10,000)
    const MAX_CONTRIBUTION_CENTS = 1000000;
    if (amountCents > MAX_CONTRIBUTION_CENTS) {
        throw new functions.https.HttpsError('invalid-argument', `Contribution cannot exceed ${MAX_CONTRIBUTION_CENTS / 100} dollars`);
    }
    const period = (0, helpers_1.getCurrentPoolPeriod)();
    functions.logger.info('Processing pool contribution', {
        userId,
        amountCents,
        period,
    });
    try {
        const result = await db.runTransaction(async (transaction) => {
            const poolRef = db.collection(types_1.COLLECTION_NAMES.COMMUNITY_POOL).doc('current');
            const poolShareRef = db.collection(types_1.COLLECTION_NAMES.POOL_SHARES).doc((0, helpers_1.getShareId)(userId, period));
            const userRef = db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId);
            // Read current state
            const [poolDoc, poolShareDoc, userDoc] = await Promise.all([
                transaction.get(poolRef),
                transaction.get(poolShareRef),
                transaction.get(userRef),
            ]);
            if (!poolDoc.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Community pool not initialized');
            }
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'User profile not found');
            }
            const pool = poolDoc.data();
            const poolShare = poolShareDoc.exists ? poolShareDoc.data() : null;
            // Calculate new values
            const newTotalPool = pool.totalPoolCents + amountCents;
            const now = admin.firestore.Timestamp.now();
            let newContributionCents;
            let newSharePercentage;
            // Update pool totals
            transaction.update(poolRef, {
                totalPoolCents: newTotalPool,
                totalContributionsCents: admin.firestore.FieldValue.increment(amountCents),
                lastCalculatedAt: now,
                version: admin.firestore.FieldValue.increment(1),
            });
            // Update or create pool share
            if (poolShare) {
                newContributionCents = poolShare.contributionCents + amountCents;
                newSharePercentage = (newContributionCents / newTotalPool) * 100;
                transaction.update(poolShareRef, {
                    contributionCents: newContributionCents,
                    contributionCount: admin.firestore.FieldValue.increment(1),
                    sharePercentage: Math.round(newSharePercentage * 10000) / 10000,
                    updatedAt: now,
                });
            }
            else {
                // Create new pool share
                const shareId = (0, helpers_1.getShareId)(userId, period);
                newContributionCents = amountCents;
                newSharePercentage = (amountCents / newTotalPool) * 100;
                const newShareData = {
                    shareId,
                    poolPeriod: period,
                    userId,
                    contributionCents: amountCents,
                    contributionCount: 1,
                    sharePercentage: Math.round(newSharePercentage * 10000) / 10000,
                    weightedScore: 0,
                    baseRefundCents: 0,
                    projectedRefundCents: 0,
                    status: 'active',
                    eligibleForRefund: true,
                    tripsIncluded: 0,
                    milesIncluded: 0,
                    averageScore: 100,
                    createdAt: now,
                    updatedAt: now,
                    finalizedAt: null,
                };
                transaction.set(poolShareRef, newShareData);
                // Update pool participant count
                transaction.update(poolRef, {
                    activeParticipants: admin.firestore.FieldValue.increment(1),
                    totalParticipantsEver: admin.firestore.FieldValue.increment(1),
                });
            }
            // Update user's denormalized pool share
            transaction.update(userRef, {
                'poolShare.contributionCents': newContributionCents,
                'poolShare.sharePercentage': Math.round(newSharePercentage * 100) / 100,
                'poolShare.lastUpdatedAt': now,
                updatedAt: now,
                updatedBy: 'cloud-function',
            });
            return {
                newContributionCents,
                sharePercentage: Math.round(newSharePercentage * 100) / 100,
            };
        });
        functions.logger.info('Pool contribution successful', {
            userId,
            amountCents,
            newContributionCents: result.newContributionCents,
            sharePercentage: result.sharePercentage,
        });
        return {
            success: true,
            newContributionCents: result.newContributionCents,
            sharePercentage: result.sharePercentage,
        };
    }
    catch (error) {
        functions.logger.error('Pool contribution failed', { userId, amountCents, error });
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to process pool contribution');
    }
}));
//# sourceMappingURL=admin.js.map