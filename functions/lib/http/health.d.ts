/**
 * HEALTH CHECK ENDPOINT
 * =====================
 * Public GET endpoint for external uptime monitoring (e.g. UptimeRobot).
 * No auth required. Returns 200 when healthy, 503 when a dependency check fails.
 */
import * as functions from 'firebase-functions';
export declare const health: functions.HttpsFunction;
//# sourceMappingURL=health.d.ts.map