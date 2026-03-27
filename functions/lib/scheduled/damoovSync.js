"use strict";
/**
 * DAILY DAMOOV SYNC
 * =================
 * Scheduled Cloud Function: runs daily at 00:30 UK time.
 * Pulls trip data and statistics from Damoov DataHub for all active users
 * with a damoovDeviceToken, writes trip records and updates driving profiles.
 *
 * maxInstances: 10 — hard cap to prevent billing loops.
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
exports.syncDamoovTrips = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const types_1 = require("../types");
const damoov_1 = require("../lib/damoov");
const db = admin.firestore();
/**
 * Format a Date as YYYY-MM-DD.
 */
function formatDate(d) {
    return d.toISOString().split('T')[0];
}
/**
 * Convert a Damoov trip to our Firestore trip document shape.
 * Distances stored in meters (canonical), durations in seconds.
 */
function damoovTripToFirestoreDoc(trip, userId) {
    const startedAt = admin.firestore.Timestamp.fromDate(new Date(trip.StartDate));
    const endedAt = admin.firestore.Timestamp.fromDate(new Date(trip.EndDate));
    const now = admin.firestore.Timestamp.now();
    return {
        tripId: `damoov_${trip.Id}`,
        userId,
        startedAt,
        endedAt,
        durationSeconds: Math.round(trip.DurationMin * 60),
        distanceMeters: Math.round(trip.DistanceKm * 1000),
        score: trip.Rating100,
        scoreBreakdown: {
            speedScore: trip.RatingSpeeding100,
            brakingScore: trip.RatingBraking100,
            accelerationScore: trip.RatingAcceleration100,
            corneringScore: trip.RatingCornering100,
            phoneUsageScore: trip.RatingPhoneUsage100,
        },
        events: {
            hardBrakingCount: trip.HardBrakingCount,
            hardAccelerationCount: trip.HardAccelerationCount,
            speedingSeconds: 0,
            sharpTurnCount: trip.CorneringCount,
            phonePickupCount: 0,
        },
        anomalies: {
            hasGpsJumps: false,
            hasImpossibleSpeed: false,
            isDuplicate: false,
            flaggedForReview: false,
        },
        status: 'completed',
        processedAt: now,
        context: null,
        startLocation: {
            lat: trip.Points?.[0]?.Latitude ?? 0,
            lng: trip.Points?.[0]?.Longitude ?? 0,
            address: null,
            placeType: null,
        },
        endLocation: {
            lat: trip.Points?.[trip.Points.length - 1]?.Latitude ?? 0,
            lng: trip.Points?.[trip.Points.length - 1]?.Longitude ?? 0,
            address: null,
            placeType: null,
        },
        source: 'damoov',
        createdAt: now,
        createdBy: 'cloud-function:damoovSync',
        pointsCount: trip.Points?.length ?? 0,
    };
}
/**
 * Sync trips for a single user. Returns success/failure for audit log.
 */
async function syncUserTrips(userId, deviceToken, startDate, endDate) {
    try {
        const trips = await (0, damoov_1.fetchDamoovTrips)(deviceToken, startDate, endDate);
        let tripsWritten = 0;
        for (const trip of trips) {
            const tripDocId = `damoov_${trip.Id}`;
            const existingTrip = await db
                .collection(types_1.COLLECTION_NAMES.TRIPS)
                .doc(tripDocId)
                .get();
            if (existingTrip.exists)
                continue;
            const tripDoc = damoovTripToFirestoreDoc(trip, userId);
            await db.collection(types_1.COLLECTION_NAMES.TRIPS).doc(tripDocId).set(tripDoc);
            tripsWritten++;
        }
        // Fetch daily stats for sparkline (last 7 days)
        const dailyStats = await (0, damoov_1.fetchDamoovDailyStats)(deviceToken, startDate, endDate);
        const weeklyScoreTrend = dailyStats
            .slice(-7)
            .map((d) => d.Score);
        // Compute rolling 30-day average from all trips in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentTripsSnap = await db
            .collection(types_1.COLLECTION_NAMES.TRIPS)
            .where('userId', '==', userId)
            .where('status', '==', 'completed')
            .where('startedAt', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
            .orderBy('startedAt', 'desc')
            .get();
        let totalScore = 0;
        let totalDistanceKm = 0;
        let tripCount = 0;
        let lastTripDate = null;
        recentTripsSnap.forEach((doc) => {
            const data = doc.data();
            totalScore += data.score ?? 0;
            totalDistanceKm += (data.distanceMeters ?? 0) / 1000;
            tripCount++;
            if (!lastTripDate)
                lastTripDate = data.startedAt;
        });
        const overallSafetyScore = tripCount > 0 ? Math.round(totalScore / tripCount) : 100;
        // Count all-time trips
        const allTripsSnap = await db
            .collection(types_1.COLLECTION_NAMES.TRIPS)
            .where('userId', '==', userId)
            .where('status', '==', 'completed')
            .count()
            .get();
        const totalTrips = allTripsSnap.data().count;
        await db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).update({
            'drivingProfile.currentScore': overallSafetyScore,
            'drivingProfile.totalTrips': totalTrips,
            'drivingProfile.lastTripAt': lastTripDate,
            damoovLastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
            damoovWeeklyScoreTrend: weeklyScoreTrend,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'cloud-function:damoovSync',
        });
        return { success: true, tripsWritten };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, tripsWritten: 0, error: message };
    }
}
exports.syncDamoovTrips = functions
    .runWith({
    secrets: ['DAMOOV_INSTANCE_ID', 'DAMOOV_INSTANCE_KEY'],
    maxInstances: 10,
    timeoutSeconds: 540,
    memory: '512MB',
})
    .region(region_1.EUROPE_LONDON)
    .pubsub.schedule('30 0 * * *')
    .timeZone('Europe/London')
    .onRun((0, sentry_1.wrapTrigger)(async (_context) => {
    functions.logger.info('Starting daily Damoov sync');
    const now = new Date();
    const endDate = formatDate(now);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = formatDate(sevenDaysAgo);
    const dateKey = formatDate(now);
    // Query all active users with a Damoov device token
    const usersSnap = await db
        .collection(types_1.COLLECTION_NAMES.USERS)
        .where('damoovDeviceToken', '!=', null)
        .get();
    const activeUsers = usersSnap.docs.filter((doc) => {
        const data = doc.data();
        return data.isActive !== false;
    });
    functions.logger.info(`Found ${activeUsers.length} users with Damoov tokens`);
    const results = [];
    for (const userDoc of activeUsers) {
        const userId = userDoc.id;
        const deviceToken = userDoc.data().damoovDeviceToken;
        if (!deviceToken)
            continue;
        const result = await syncUserTrips(userId, deviceToken, startDate, endDate);
        results.push({ userId, ...result });
    }
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const totalTripsWritten = results.reduce((sum, r) => sum + r.tripsWritten, 0);
    // Write audit log
    await db
        .collection('systemLogs')
        .doc(dateKey)
        .collection('damoovSync')
        .add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        usersProcessed: activeUsers.length,
        successCount,
        failCount,
        totalTripsWritten,
        dateRange: { startDate, endDate },
        results: results.map((r) => ({
            userId: r.userId,
            success: r.success,
            tripsWritten: r.tripsWritten,
            error: r.error ?? null,
        })),
        createdBy: 'cloud-function:damoovSync',
    });
    functions.logger.info('Damoov sync complete', {
        usersProcessed: activeUsers.length,
        successCount,
        failCount,
        totalTripsWritten,
    });
}));
//# sourceMappingURL=damoovSync.js.map