"use strict";
/**
 * GDPR DATA EXPORT & ACCOUNT DELETION
 * ===================================
 * UK GDPR: right to data portability (export) and right to erasure (delete).
 * - exportUserData: returns all user data as JSON (for download).
 * - deleteUserAccount: deletes all user data and Firebase Auth account.
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
exports.deleteUserAccount = exports.exportUserData = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const auth_1 = require("./auth");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = admin.firestore();
const auth = admin.auth();
const BATCH_SIZE = 500;
/** Convert Firestore Timestamp to ISO string for JSON export */
function serializeForExport(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (typeof obj !== 'object')
        return obj;
    if (obj instanceof Date)
        return obj.toISOString();
    const ts = obj;
    if (typeof ts.toDate === 'function') {
        return ts.toDate().toISOString();
    }
    if (Array.isArray(obj))
        return obj.map(serializeForExport);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = serializeForExport(v);
    }
    return out;
}
/**
 * Export all user data for GDPR data portability.
 * Authenticated user must request their own userId.
 */
exports.exportUserData = functions
    .region(region_1.EUROPE_LONDON)
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    (0, auth_1.requireAuth)(context);
    const requestedUserId = data?.userId;
    (0, auth_1.requireSelf)(context, requestedUserId);
    const userId = requestedUserId;
    // TODO: Rate limiting – e.g. max 1 export per user per 24 hours
    functions.logger.info('Exporting user data', { userId });
    const userRef = db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? serializeForExport({ id: userSnap.id, ...userSnap.data() }) : null;
    const tripsSnap = await db
        .collection(types_1.COLLECTION_NAMES.TRIPS)
        .where('userId', '==', userId)
        .get();
    const trips = tripsSnap.docs.map((d) => serializeForExport({ id: d.id, ...d.data() }));
    const tripIds = tripsSnap.docs.map((d) => d.id);
    const PARALLEL_BATCH = 10;
    const tripPointsList = [];
    for (let i = 0; i < tripIds.length; i += PARALLEL_BATCH) {
        const chunk = tripIds.slice(i, i + PARALLEL_BATCH);
        const results = await Promise.all(chunk.map(async (tripId) => {
            const pointsRef = db.collection(types_1.COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
            const pointsSnap = await pointsRef.get();
            if (!pointsSnap.exists)
                return null;
            const pointsData = pointsSnap.data();
            const batchesSnap = await pointsRef.collection('batches').orderBy('batchIndex').get();
            let points = [];
            if (pointsData.points && Array.isArray(pointsData.points)) {
                points = pointsData.points;
            }
            else if (!batchesSnap.empty) {
                for (const b of batchesSnap.docs) {
                    const batchPoints = b.data().points;
                    if (batchPoints)
                        points = points.concat(batchPoints);
                }
            }
            return serializeForExport({
                tripId,
                userId: pointsData.userId,
                points,
                samplingRateHz: pointsData.samplingRateHz,
                totalPoints: pointsData.totalPoints ?? points.length,
                createdAt: pointsData.createdAt,
            });
        }));
        for (const r of results) {
            if (r)
                tripPointsList.push(r);
        }
    }
    const segmentsSnap = await db
        .collection(types_1.COLLECTION_NAMES.TRIP_SEGMENTS)
        .where('userId', '==', userId)
        .get();
    const tripSegments = segmentsSnap.docs.map((d) => serializeForExport({ id: d.id, ...d.data() }));
    const policiesSnap = await db
        .collection(types_1.COLLECTION_NAMES.POLICIES)
        .where('userId', '==', userId)
        .get();
    const policies = policiesSnap.docs.map((d) => serializeForExport({ id: d.id, ...d.data() }));
    const poolSharesSnap = await db
        .collection(types_1.COLLECTION_NAMES.POOL_SHARES)
        .where('userId', '==', userId)
        .get();
    const poolShares = poolSharesSnap.docs.map((d) => serializeForExport({ id: d.id, ...d.data() }));
    let driverStats = null;
    const driverStatsRef = db.collection('driver_stats').doc(userId);
    const driverStatsSnap = await driverStatsRef.get();
    if (driverStatsSnap.exists) {
        driverStats = serializeForExport({ id: driverStatsSnap.id, ...driverStatsSnap.data() });
    }
    const exportPayload = {
        exportedAt: new Date().toISOString(),
        userId,
        user: userData,
        trips,
        tripPoints: tripPointsList,
        tripSegments,
        policies,
        poolShares,
        driver_stats: driverStats,
    };
    return exportPayload;
}));
/**
 * Delete user account and all associated data (GDPR right to erasure).
 * Uses batched deletes for atomicity where possible; then deletes Firebase Auth user.
 */
exports.deleteUserAccount = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (data, context) => {
    (0, auth_1.requireAuth)(context);
    const requestedUserId = data?.userId;
    (0, auth_1.requireSelf)(context, requestedUserId);
    const userId = requestedUserId;
    // TODO: Rate limiting – consider requiring re-auth or delay before delete
    functions.logger.info('Deleting user account', { userId });
    const tripSnap = await db
        .collection(types_1.COLLECTION_NAMES.TRIPS)
        .where('userId', '==', userId)
        .get();
    const tripIds = tripSnap.docs.map((d) => d.id);
    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;
    function flushBatch() {
        if (opCount > 0) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            opCount = 0;
        }
    }
    function addDelete(ref) {
        currentBatch.delete(ref);
        opCount++;
        if (opCount >= BATCH_SIZE)
            flushBatch();
    }
    for (const d of tripSnap.docs) {
        addDelete(d.ref);
    }
    for (const tripId of tripIds) {
        const pointsRef = db.collection(types_1.COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
        const batchesRef = pointsRef.collection('batches');
        const batchDocs = await batchesRef.get();
        for (const d of batchDocs.docs)
            addDelete(d.ref);
        addDelete(pointsRef);
    }
    const segmentsSnap = await db
        .collection(types_1.COLLECTION_NAMES.TRIP_SEGMENTS)
        .where('userId', '==', userId)
        .get();
    for (const d of segmentsSnap.docs)
        addDelete(d.ref);
    const policiesSnap = await db
        .collection(types_1.COLLECTION_NAMES.POLICIES)
        .where('userId', '==', userId)
        .get();
    for (const d of policiesSnap.docs)
        addDelete(d.ref);
    const poolSharesSnap = await db
        .collection(types_1.COLLECTION_NAMES.POOL_SHARES)
        .where('userId', '==', userId)
        .get();
    for (const d of poolSharesSnap.docs)
        addDelete(d.ref);
    const driverStatsRef = db.collection('driver_stats').doc(userId);
    const driverStatsSnap = await driverStatsRef.get();
    if (driverStatsSnap.exists)
        addDelete(driverStatsRef);
    const userRef = db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId);
    addDelete(userRef);
    flushBatch();
    for (const batch of batches) {
        await batch.commit();
    }
    try {
        await auth.deleteUser(userId);
    }
    catch (err) {
        functions.logger.error('Failed to delete Firebase Auth user', { userId, err });
        throw new functions.https.HttpsError('internal', 'Firestore data was deleted but we could not delete your auth account. Please contact support.');
    }
    functions.logger.info('User account deleted', { userId });
    return { success: true, message: 'Account and all associated data have been permanently deleted.' };
}));
//# sourceMappingURL=gdpr.js.map