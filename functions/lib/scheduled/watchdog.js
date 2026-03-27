"use strict";
/**
 * WATCHDOG FUNCTION
 * =================
 * Scheduled Cloud Function: runs every 60 minutes.
 * Monitors trip health: failed trip spikes, GPS drop-off, and stuck trips.
 *
 * Alerts are sent to Sentry and logged with [watchdog] metric tags
 * for Cloud Monitoring log-based alerting.
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
exports.monitorTripHealth = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = admin.firestore();
const FAILED_TRIP_THRESHOLD = 5;
const STALE_HOURS = 24;
exports.monitorTripHealth = functions
    .region(region_1.EUROPE_LONDON)
    .pubsub
    .schedule('every 60 minutes')
    .timeZone('Europe/London')
    .onRun((0, sentry_1.wrapTrigger)(async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const staleThreshold = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000);
    // 1. Count failed trips in the last hour
    const failedTripsSnap = await db
        .collection(types_1.COLLECTION_NAMES.TRIPS)
        .where('status', '==', 'failed')
        .where('processedAt', '>=', admin.firestore.Timestamp.fromDate(oneHourAgo))
        .get();
    const failedCount = failedTripsSnap.size;
    if (failedCount >= FAILED_TRIP_THRESHOLD) {
        const msg = `ALERT: ${failedCount} failed trips in the last hour (threshold: ${FAILED_TRIP_THRESHOLD})`;
        functions.logger.error('[watchdog] failed_trips_spike', {
            metric: 'watchdog',
            alert: 'failed_trips_spike',
            failedCount,
            threshold: FAILED_TRIP_THRESHOLD,
        });
        (0, sentry_1.captureError)(msg, { failedCount, threshold: FAILED_TRIP_THRESHOLD });
    }
    // 2. Check for GPS upload drop-off (no new trips across all users for STALE_HOURS)
    const recentTripsSnap = await db
        .collection(types_1.COLLECTION_NAMES.TRIPS)
        .where('startedAt', '>=', admin.firestore.Timestamp.fromDate(staleThreshold))
        .limit(1)
        .get();
    if (recentTripsSnap.empty) {
        const msg = `WARNING: No new trips in the last ${STALE_HOURS} hours — possible GPS upload drop-off`;
        functions.logger.warn('[watchdog] no_recent_trips', {
            metric: 'watchdog',
            alert: 'no_recent_trips',
            staleHours: STALE_HOURS,
        });
        (0, sentry_1.captureError)(msg, { staleHours: STALE_HOURS });
    }
    // 3. Check for stuck trips (in 'processing' status for > 1 hour)
    const stuckTripsSnap = await db
        .collection(types_1.COLLECTION_NAMES.TRIPS)
        .where('status', '==', 'processing')
        .where('startedAt', '<=', admin.firestore.Timestamp.fromDate(oneHourAgo))
        .limit(10)
        .get();
    if (!stuckTripsSnap.empty) {
        const stuckIds = stuckTripsSnap.docs.map((d) => d.id);
        functions.logger.warn('[watchdog] stuck_trips', {
            metric: 'watchdog',
            alert: 'stuck_trips',
            count: stuckIds.length,
            tripIds: stuckIds,
        });
        (0, sentry_1.captureError)(`${stuckIds.length} trips stuck in processing for > 1 hour`, {
            tripIds: stuckIds,
        });
    }
    functions.logger.info('[watchdog] health check complete', {
        metric: 'watchdog',
        failedLastHour: failedCount,
        hasRecentTrips: !recentTripsSnap.empty,
        stuckTrips: stuckTripsSnap.size,
    });
}));
//# sourceMappingURL=watchdog.js.map