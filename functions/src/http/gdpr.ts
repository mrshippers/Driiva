/**
 * GDPR DATA EXPORT & ACCOUNT DELETION
 * ===================================
 * UK GDPR: right to data portability (export) and right to erasure (delete).
 * - exportUserData: returns all user data as JSON (for download).
 * - deleteUserAccount: deletes all user data and Firebase Auth account.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION_NAMES } from '../types';
import { requireAuth, requireSelf } from './auth';
import type { CallableContext } from './auth';
import { EUROPE_LONDON } from '../lib/region';
import { wrapFunction } from '../lib/sentry';

const db = admin.firestore();
const auth = admin.auth();

const BATCH_SIZE = 500;

/** Convert Firestore Timestamp to ISO string for JSON export */
function serializeForExport(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  const ts = obj as { toDate?: () => Date };
  if (typeof ts.toDate === 'function') {
    return ts.toDate().toISOString();
  }
  if (Array.isArray(obj)) return obj.map(serializeForExport);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = serializeForExport(v);
  }
  return out;
}

/**
 * Export all user data for GDPR data portability.
 * Authenticated user must request their own userId.
 */
export const exportUserData = functions
  .region(EUROPE_LONDON)
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(wrapFunction(async (data: { userId?: string }, context: CallableContext) => {
  requireAuth(context);
  const requestedUserId = data?.userId as string | undefined;
  requireSelf(context, requestedUserId);
  const userId = requestedUserId!;

  // TODO: Rate limiting – e.g. max 1 export per user per 24 hours

  functions.logger.info('Exporting user data', { userId });

  const userRef = db.collection(COLLECTION_NAMES.USERS).doc(userId);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? serializeForExport({ id: userSnap.id, ...userSnap.data() }) : null;

  const tripsSnap = await db
    .collection(COLLECTION_NAMES.TRIPS)
    .where('userId', '==', userId)
    .get();

  const trips = tripsSnap.docs.map((d: admin.firestore.QueryDocumentSnapshot) => serializeForExport({ id: d.id, ...d.data() }));

  const tripIds = tripsSnap.docs.map((d) => d.id);

  const PARALLEL_BATCH = 10;
  const tripPointsList: Record<string, unknown>[] = [];

  for (let i = 0; i < tripIds.length; i += PARALLEL_BATCH) {
    const chunk = tripIds.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.all(chunk.map(async (tripId) => {
      const pointsRef = db.collection(COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
      const pointsSnap = await pointsRef.get();
      if (!pointsSnap.exists) return null;
      const pointsData = pointsSnap.data()!;
      const batchesSnap = await pointsRef.collection('batches').orderBy('batchIndex').get();
      let points: unknown[] = [];
      if (pointsData.points && Array.isArray(pointsData.points)) {
        points = pointsData.points;
      } else if (!batchesSnap.empty) {
        for (const b of batchesSnap.docs) {
          const batchPoints = (b.data() as { points?: unknown[] }).points;
          if (batchPoints) points = points.concat(batchPoints);
        }
      }
      return serializeForExport({
        tripId,
        userId: pointsData.userId,
        points,
        samplingRateHz: pointsData.samplingRateHz,
        totalPoints: pointsData.totalPoints ?? points.length,
        createdAt: pointsData.createdAt,
      }) as Record<string, unknown>;
    }));
    for (const r of results) {
      if (r) tripPointsList.push(r);
    }
  }

  const segmentsSnap = await db
    .collection(COLLECTION_NAMES.TRIP_SEGMENTS)
    .where('userId', '==', userId)
    .get();
  const tripSegments = segmentsSnap.docs.map((d: admin.firestore.QueryDocumentSnapshot) => serializeForExport({ id: d.id, ...d.data() }));

  const policiesSnap = await db
    .collection(COLLECTION_NAMES.POLICIES)
    .where('userId', '==', userId)
    .get();
  const policies = policiesSnap.docs.map((d: admin.firestore.QueryDocumentSnapshot) => serializeForExport({ id: d.id, ...d.data() }));

  const poolSharesSnap = await db
    .collection(COLLECTION_NAMES.POOL_SHARES)
    .where('userId', '==', userId)
    .get();
  const poolShares = poolSharesSnap.docs.map((d: admin.firestore.QueryDocumentSnapshot) => serializeForExport({ id: d.id, ...d.data() }));

  let driverStats: unknown = null;
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
export const deleteUserAccount = functions
  .region(EUROPE_LONDON)
  .https.onCall(wrapFunction(async (data: { userId?: string }, context: CallableContext) => {
  requireAuth(context);
  const requestedUserId = data?.userId as string | undefined;
  requireSelf(context, requestedUserId);
  const userId = requestedUserId!;

  // Require recent authentication (within last 5 minutes) to prevent
  // account deletion via stolen/stale session tokens
  const authTimeSec = context.auth!.token.auth_time;
  if (typeof authTimeSec !== 'number') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Unable to verify authentication freshness. Please sign in again and retry.'
    );
  }
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
  if (authTimeSec < fiveMinutesAgo) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'For security, please re-authenticate before deleting your account. Sign out and sign back in, then try again within 5 minutes.'
    );
  }

  functions.logger.info('Deleting user account', { userId });

  const tripSnap = await db
    .collection(COLLECTION_NAMES.TRIPS)
    .where('userId', '==', userId)
    .get();
  const tripIds = tripSnap.docs.map((d) => d.id);

  type WriteBatch = ReturnType<typeof db.batch>;
  const batches: WriteBatch[] = [];
  let currentBatch = db.batch();
  let opCount = 0;

  function flushBatch(): void {
    if (opCount > 0) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      opCount = 0;
    }
  }

  function addDelete(ref: admin.firestore.DocumentReference): void {
    currentBatch.delete(ref);
    opCount++;
    if (opCount >= BATCH_SIZE) flushBatch();
  }

  for (const d of tripSnap.docs) {
    addDelete(d.ref);
  }

  for (const tripId of tripIds) {
    const pointsRef = db.collection(COLLECTION_NAMES.TRIP_POINTS).doc(tripId);
    const batchesRef = pointsRef.collection('batches');
    const batchDocs = await batchesRef.get();
    for (const d of batchDocs.docs) addDelete(d.ref);
    addDelete(pointsRef);
  }

  const segmentsSnap = await db
    .collection(COLLECTION_NAMES.TRIP_SEGMENTS)
    .where('userId', '==', userId)
    .get();
  for (const d of segmentsSnap.docs) addDelete(d.ref);

  const policiesSnap = await db
    .collection(COLLECTION_NAMES.POLICIES)
    .where('userId', '==', userId)
    .get();
  for (const d of policiesSnap.docs) addDelete(d.ref);

  const poolSharesSnap = await db
    .collection(COLLECTION_NAMES.POOL_SHARES)
    .where('userId', '==', userId)
    .get();
  for (const d of poolSharesSnap.docs) addDelete(d.ref);

  const driverStatsRef = db.collection('driver_stats').doc(userId);
  const driverStatsSnap = await driverStatsRef.get();
  if (driverStatsSnap.exists) addDelete(driverStatsRef);

  const userRef = db.collection(COLLECTION_NAMES.USERS).doc(userId);
  addDelete(userRef);

  flushBatch();

  for (const batch of batches) {
    await batch.commit();
  }

  try {
    await auth.deleteUser(userId);
  } catch (err) {
    functions.logger.error('Failed to delete Firebase Auth user', { userId, err });
    throw new functions.https.HttpsError(
      'internal',
      'Firestore data was deleted but we could not delete your auth account. Please contact support.'
    );
  }

  functions.logger.info('User account deleted', { userId });

  return { success: true, message: 'Account and all associated data have been permanently deleted.' };
}));
