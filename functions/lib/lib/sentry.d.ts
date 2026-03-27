/**
 * SENTRY ERROR MONITORING — CLOUD FUNCTIONS
 * ==========================================
 * Wraps Cloud Functions with Sentry error tracking.
 *
 * Set SENTRY_DSN_FUNCTIONS in environment to enable.
 * If not set, errors are still logged via Firebase Functions logger.
 *
 * Usage:
 *   import { wrapFunction, captureError } from '../lib/sentry';
 *
 *   // Wrap a Cloud Function handler:
 *   export const myFunction = functions.https.onCall(
 *     wrapFunction(async (data, context) => { ... })
 *   );
 *
 *   // Manual capture:
 *   captureError(error, { tripId, userId });
 */
import * as functions from 'firebase-functions';
/**
 * Initialize Sentry for Cloud Functions.
 * Safe to call multiple times — only initializes once.
 */
export declare function initSentry(): void;
/**
 * Capture an error with extra context.
 */
export declare function captureError(error: Error | string, context?: Record<string, unknown>): void;
/**
 * Set user context for Sentry.
 */
export declare function setSentryUser(userId: string): void;
/**
 * Wrap a Cloud Function handler with Sentry error tracking.
 *
 * Automatically:
 *   - Initializes Sentry (if DSN is set)
 *   - Sets user context from auth
 *   - Captures unhandled errors
 *   - Flushes events before function returns
 */
export declare function wrapFunction<TData, TResult>(handler: (data: TData, context: functions.https.CallableContext) => Promise<TResult>): (data: TData, context: functions.https.CallableContext) => Promise<TResult>;
/**
 * Wrap a Firestore trigger handler with Sentry error tracking.
 */
export declare function wrapTrigger<T extends (...args: any[]) => Promise<any>>(handler: T): T;
//# sourceMappingURL=sentry.d.ts.map