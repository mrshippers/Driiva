/**
 * TRIP TRIGGERS
 * =============
 * Cloud Functions triggered by trip document changes.
 */
import * as functions from 'firebase-functions';
export { finalizeTripFromPoints } from './tripFinalisation';
export { updateDriverProfileAndPoolShare } from './driverProfile';
/**
 * Triggered when a new trip is created
 * - Detects anomalies
 * - Enriches with context (night driving, rush hour)
 * - Updates trip status
 */
export declare const onTripCreate: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
/**
 * Triggered when trip status changes
 * Handles:
 * 1. Trip finalization (recording → processing): Compute metrics from GPS points
 * 2. Manual review completion (processing → completed): Update driver profile
 */
export declare const onTripStatusChange: functions.CloudFunction<functions.Change<functions.firestore.QueryDocumentSnapshot>>;
//# sourceMappingURL=trips.d.ts.map