"use strict";
/**
 * SYNC TRIP ON COMPLETE
 * =====================
 * Firestore trigger: when a trip's status becomes 'completed', write a summary row
 * to PostgreSQL trips_summary for API access.
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
exports.syncTripOnComplete = void 0;
const functions = __importStar(require("firebase-functions"));
const types_1 = require("../types");
const neon_1 = require("../lib/neon");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
exports.syncTripOnComplete = functions
    .region(region_1.EUROPE_LONDON)
    .runWith({ secrets: ['DATABASE_URL'] })
    .firestore
    .document(`${types_1.COLLECTION_NAMES.TRIPS}/{tripId}`)
    .onUpdate((0, sentry_1.wrapTrigger)(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status || after.status !== 'completed') {
        return;
    }
    const tripId = context.params.tripId;
    const trip = after;
    try {
        const pgUserId = await (0, neon_1.getPgUserIdByFirebaseUid)(trip.userId);
        if (pgUserId === null) {
            functions.logger.warn('No PostgreSQL user for Firebase uid, skipping trip sync', { tripId, firebaseUid: trip.userId });
            return;
        }
        const startedAt = trip.startedAt?.toDate?.() ?? new Date();
        const endedAt = trip.endedAt?.toDate?.() ?? new Date();
        const distanceKm = trip.distanceMeters / 1000;
        const events = trip.events ?? {
            hardBrakingCount: 0,
            hardAccelerationCount: 0,
            speedingSeconds: 0,
            sharpTurnCount: 0,
            phonePickupCount: 0,
        };
        await (0, neon_1.insertTripSummary)({
            userId: pgUserId,
            firestoreTripId: tripId,
            startedAt,
            endedAt,
            distanceKm,
            durationSeconds: trip.durationSeconds ?? 0,
            score: trip.score ?? 0,
            hardBrakingEvents: events.hardBrakingCount,
            harshAcceleration: events.hardAccelerationCount,
            speedViolations: Math.floor((events.speedingSeconds ?? 0) / 60),
            nightDriving: trip.context?.isNightDriving ?? false,
            sharpCorners: events.sharpTurnCount,
            startAddress: trip.startLocation?.address ?? null,
            endAddress: trip.endLocation?.address ?? null,
        });
        functions.logger.info('Synced trip to PostgreSQL', { tripId, userId: trip.userId, pgUserId });
    }
    catch (error) {
        functions.logger.error('Failed to sync trip to PostgreSQL', { tripId, error });
        throw error;
    }
}));
//# sourceMappingURL=syncTripOnComplete.js.map