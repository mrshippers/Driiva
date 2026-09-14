/**
 * WATCHDOG FUNCTION
 * =================
 * Scheduled Cloud Function: runs every 60 minutes.
 * Monitors trip health: failed trip spikes, GPS drop-off, and stuck trips.
 *
 * Alerts are sent to Sentry and logged with [watchdog] metric tags
 * for Cloud Monitoring log-based alerting.
 */
import * as functions from 'firebase-functions';
export declare const monitorTripHealth: functions.CloudFunction<unknown>;
//# sourceMappingURL=watchdog.d.ts.map