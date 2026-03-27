/**
 * HEALTH CHECK ENDPOINT
 * =====================
 * Public GET endpoint for external uptime monitoring (e.g. UptimeRobot).
 * No auth required. Returns 200 when healthy, 503 when a dependency check fails.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION_NAMES } from '../types';
import { EUROPE_LONDON } from '../lib/region';

const db = admin.firestore();

const FIRESTORE_CHECK_TIMEOUT_MS = 5000;

export const health = functions
  .region(EUROPE_LONDON)
  .https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).set('Allow', 'GET').send();
    return;
  }

  const timestamp = new Date().toISOString();

  try {
    // Lightweight Firestore reachability check with timeout
    const firestoreOk = await Promise.race([
      db.collection(COLLECTION_NAMES.USERS).limit(1).get(),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore check timeout')), FIRESTORE_CHECK_TIMEOUT_MS)
      ),
    ]).then(
      () => true,
      () => false
    );

    if (!firestoreOk) {
      res.status(503).json({
        status: 'unhealthy',
        reason: 'firestore',
        service: 'driiva-functions',
        timestamp,
      });
      return;
    }

    res.status(200).json({
      status: 'healthy',
      service: 'driiva-functions',
      version: process.env.npm_package_version || '1.0.0',
      region: 'europe-west2',
      timestamp,
      checks: {
        firestore: 'ok',
      },
    });
  } catch (e) {
    functions.logger.warn('[health] Dependency check failed', { error: String(e) });
    res.status(503).json({
      status: 'unhealthy',
      reason: 'firestore',
      service: 'driiva-functions',
      timestamp,
    });
  }
});
