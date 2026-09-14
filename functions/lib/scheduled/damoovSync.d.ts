/**
 * DAILY DAMOOV SYNC
 * =================
 * Scheduled Cloud Function: runs daily at 00:30 UK time.
 * Pulls trip data and statistics from Damoov DataHub for all active users
 * with a damoovDeviceToken, writes trip records and updates driving profiles.
 *
 * maxInstances: 10 - hard cap to prevent billing loops.
 */
import * as functions from 'firebase-functions';
export declare const syncDamoovTrips: functions.CloudFunction<unknown>;
//# sourceMappingURL=damoovSync.d.ts.map