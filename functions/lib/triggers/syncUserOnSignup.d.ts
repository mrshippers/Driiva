/**
 * SYNC USER ON SIGNUP
 * ===================
 * Firebase Auth trigger: when a new user is created, mirror them to Neon PostgreSQL.
 * This keeps users + onboarding_complete as single source of truth in PostgreSQL.
 */
import * as functions from 'firebase-functions';
export declare const syncUserOnSignup: functions.CloudFunction<import("firebase-admin/auth").UserRecord>;
//# sourceMappingURL=syncUserOnSignup.d.ts.map