/**
 * POOL SHARE TRIGGERS
 * ===================
 * Cloud Functions triggered by pool share document changes.
 */
import * as functions from 'firebase-functions';
/**
 * Triggered when a pool share is created or updated
 * Syncs pool share summary to user document
 */
export declare const onPoolShareWrite: functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>>;
//# sourceMappingURL=pool.d.ts.map