"use strict";
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
exports.updateDriverProfileAndPoolShare = updateDriverProfileAndPoolShare;
/**
 * Rolling the finished trip into the driver's profile and their pool share,
 * transactionally. Extracted verbatim from functions/src/triggers/trips.ts.
 */
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const contracts_1 = require("@driiva/contracts");
const types_1 = require("../types");
const helpers_1 = require("../utils/helpers");
const db_1 = require("../lib/db");
/**
 * Update driver profile and pool share after trip completion
 * This is the main business logic for trip processing
 */
// Exported for the M2 emulator integration test - see finalizeTripFromPoints above.
async function updateDriverProfileAndPoolShare(trip, tripId) {
    const period = (0, helpers_1.getCurrentPoolPeriod)();
    await db_1.db.runTransaction(async (transaction) => {
        // References
        const userRef = db_1.db.collection(types_1.COLLECTION_NAMES.USERS).doc(trip.userId);
        const poolShareRef = db_1.db.collection(types_1.COLLECTION_NAMES.POOL_SHARES).doc((0, helpers_1.getShareId)(trip.userId, period));
        const tripRef = db_1.db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripId);
        // Read current state
        const [userDoc, poolShareDoc, tripDoc] = await Promise.all([
            transaction.get(userRef),
            transaction.get(poolShareRef),
            transaction.get(tripRef),
        ]);
        // Idempotency: score each trip into the profile exactly once. Write B's
        // status flip can re-trigger this via onTripStatusChange CASE 2, and a
        // crashed invocation can be retried by the Cloud Functions runtime. The
        // per-trip marker is checked and set in this SAME transaction as the
        // profile update, so the check-and-set is atomic and race-safe.
        if (tripDoc.exists && tripDoc.data()?.profileApplied === true) {
            functions.logger.info(`Trip ${tripId} already applied to profile, skipping duplicate`);
            return;
        }
        if (!userDoc.exists) {
            functions.logger.error(`User ${trip.userId} not found for trip ${tripId}`);
            throw new Error(`User ${trip.userId} not found`);
        }
        const user = userDoc.data();
        const poolShare = poolShareDoc.exists ? poolShareDoc.data() : null;
        // Calculate new profile values
        const distanceMiles = trip.distanceMeters / 1609.34;
        const durationMinutes = trip.durationSeconds / 60;
        const newTotalTrips = user.drivingProfile.totalTrips + 1;
        const newTotalMiles = user.drivingProfile.totalMiles + distanceMiles;
        const newTotalMinutes = user.drivingProfile.totalDrivingMinutes + durationMinutes;
        // Recalculate weighted average score.
        // The weight is scoreWeight(), not totalTrips: the starting score carries
        // the weight of a notional trip, so a driver's first real trip is averaged
        // WITH their starting position rather than replacing it. Using totalTrips
        // here would silently discard the starting score on trip one, which is the
        // behaviour that made a new profile only ever able to move downwards.
        const oldWeight = (0, contracts_1.scoreWeight)(user.drivingProfile.totalTrips);
        const newScore = (user.drivingProfile.currentScore * oldWeight + trip.score) / (oldWeight + 1);
        // Update score breakdown (weighted average)
        const newScoreBreakdown = {
            speedScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.speedScore, trip.scoreBreakdown.speedScore, oldWeight),
            brakingScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.brakingScore, trip.scoreBreakdown.brakingScore, oldWeight),
            accelerationScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.accelerationScore, trip.scoreBreakdown.accelerationScore, oldWeight),
            corneringScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.corneringScore, trip.scoreBreakdown.corneringScore, oldWeight),
            phoneUsageScore: (0, helpers_1.weightedAverage)(user.drivingProfile.scoreBreakdown.phoneUsageScore, trip.scoreBreakdown.phoneUsageScore, oldWeight),
        };
        // Determine risk tier
        const riskTier = (0, helpers_1.calculateRiskTier)(newScore);
        // Update recent trips (FIFO, max 3)
        const tripSummary = {
            tripId,
            startedAt: trip.startedAt,
            endedAt: trip.endedAt,
            // Metres and seconds, straight off the trip document. See the unit
            // convention on RecentTripSummary in ../types.ts.
            distanceMeters: Math.round(trip.distanceMeters),
            durationSeconds: Math.round(trip.durationSeconds),
            score: trip.score,
            routeSummary: (0, helpers_1.buildRouteSummary)(trip.startLocation, trip.endLocation),
        };
        const newRecentTrips = [tripSummary, ...user.recentTrips].slice(0, 3);
        // Calculate streak days
        let streakDays = user.drivingProfile.streakDays;
        if (user.drivingProfile.lastTripAt) {
            const lastTripDate = user.drivingProfile.lastTripAt.toDate();
            const currentTripDate = trip.endedAt.toDate();
            const daysDiff = Math.floor((currentTripDate.getTime() - lastTripDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff <= 1 && trip.score >= 70) {
                streakDays += 1;
            }
            else if (daysDiff > 1) {
                streakDays = trip.score >= 70 ? 1 : 0;
            }
        }
        else {
            streakDays = trip.score >= 70 ? 1 : 0;
        }
        // Write: Update user profile
        transaction.update(userRef, {
            'drivingProfile.currentScore': Math.round(newScore * 100) / 100,
            'drivingProfile.scoreBreakdown': newScoreBreakdown,
            'drivingProfile.totalTrips': newTotalTrips,
            'drivingProfile.totalMiles': Math.round(newTotalMiles * 100) / 100,
            'drivingProfile.totalDrivingMinutes': Math.round(newTotalMinutes),
            'drivingProfile.lastTripAt': trip.endedAt,
            'drivingProfile.riskTier': riskTier,
            'drivingProfile.streakDays': streakDays,
            recentTrips: newRecentTrips,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedBy: 'cloud-function',
        });
        // Write: Update pool share (if exists)
        if (poolShare) {
            const newShareTrips = poolShare.tripsIncluded + 1;
            const newShareMiles = poolShare.milesIncluded + distanceMiles;
            const newShareAvgScore = (poolShare.averageScore * poolShare.tripsIncluded + trip.score) / newShareTrips;
            transaction.update(poolShareRef, {
                tripsIncluded: newShareTrips,
                milesIncluded: Math.round(newShareMiles * 100) / 100,
                averageScore: Math.round(newShareAvgScore * 100) / 100,
                weightedScore: Math.round(newShareAvgScore * poolShare.contributionCents / 100),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        // Mark this trip as applied so any re-delivery of the same completion is a
        // no-op (see the idempotency check at the top of this transaction). Use a
        // merge set rather than update so a caller that reaches here before the trip
        // doc exists (e.g. a future manual-review path) does not throw.
        transaction.set(tripRef, { profileApplied: true }, { merge: true });
        functions.logger.info(`Updated profile for user ${trip.userId}`, {
            newScore: Math.round(newScore * 100) / 100,
            totalTrips: newTotalTrips,
            totalMiles: Math.round(newTotalMiles * 100) / 100,
            riskTier,
            streakDays,
        });
    });
}
//# sourceMappingURL=driverProfile.js.map