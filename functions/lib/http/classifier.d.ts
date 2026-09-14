/**
 * TRIP CLASSIFIER HTTP FUNCTIONS
 * ==============================
 * HTTP callable functions to invoke the Python Stop-Go-Classifier.
 *
 * Auth: requireAuth (401 if missing/expired token); ownership enforced
 * so users can only classify their own trips (403 otherwise).
 *
 * The Python classifier is deployed as a separate Cloud Function (2nd gen).
 * This TypeScript function calls it after trip finalization to detect
 * stops and trip segments.
 */
import * as functions from 'firebase-functions';
import { TripDocument } from '../types';
/**
 * Classify a completed trip
 *
 * Callable from client or other Cloud Functions to trigger classification
 * for a specific trip. User can only classify their own trips (trip.userId
 * must equal auth.uid).
 *
 * @param data.tripId - The trip ID to classify
 * @returns Classification results
 */
export declare const classifyTrip: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Batch classify multiple trips
 *
 * Admin-only. Reject unauthenticated with 401, non-admin with 403.
 */
export declare const batchClassifyTrips: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Classify trip after completion
 *
 * Called from trip triggers when a trip transitions to 'completed'.
 * This is the main entry point for automatic classification.
 */
export declare function classifyCompletedTrip(tripId: string, trip: TripDocument): Promise<void>;
//# sourceMappingURL=classifier.d.ts.map