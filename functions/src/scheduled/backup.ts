/**
 * FIRESTORE BACKUP FUNCTION
 * =========================
 * Scheduled Cloud Function: runs daily at 2 AM London time.
 * Triggers a Firestore export to a GCS bucket via the admin REST API.
 *
 * Requires the Cloud Functions service account to have the
 * `roles/datastore.importExportAdmin` and `roles/storage.admin` roles.
 *
 * Metrics logged with [backup] tag for Cloud Monitoring log-based alerting.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger, captureError } from '../lib/sentry';

export const dailyFirestoreBackup = functions
  .region(EUROPE_LONDON)
  .pubsub
  .schedule('every day 02:00')
  .timeZone('Europe/London')
  .onRun(wrapTrigger(async () => {
    const projectId =
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      admin.instanceId();

    const bucket =
      process.env.FIRESTORE_BACKUP_BUCKET || 'driiva-firestore-backups';

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const outputUri = `gs://${bucket}/${today}`;

    functions.logger.info('[backup] Starting daily Firestore backup', {
      metric: 'backup',
      projectId,
      outputUri,
    });

    try {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const client = await auth.getClient();
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`;

      const response = await client.request({
        url,
        method: 'POST',
        data: {
          outputUriPrefix: outputUri,
          // Empty collectionIds = export all collections
          collectionIds: [],
        },
      });

      functions.logger.info('[backup] Firestore export initiated successfully', {
        metric: 'backup',
        outputUri,
        operationName: (response.data as Record<string, unknown>)?.name || 'unknown',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      functions.logger.error('[backup] Firestore export failed', {
        metric: 'backup',
        error: message,
        projectId,
        outputUri,
      });
      captureError(
        error instanceof Error ? error : new Error(message),
        { projectId, outputUri },
      );
      // Do not re-throw — prevents endless retries
    }
  }));
