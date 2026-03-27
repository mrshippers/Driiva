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

import * as Sentry from '@sentry/node';
import * as functions from 'firebase-functions';

const SENTRY_DSN = process.env.SENTRY_DSN_FUNCTIONS;

let initialized = false;

/**
 * Initialize Sentry for Cloud Functions.
 * Safe to call multiple times — only initializes once.
 */
export function initSentry(): void {
  if (initialized || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.FUNCTIONS_EMULATOR === 'true' ? 'emulator' : 'production',
    release: `driiva-functions@${process.env.npm_package_version || '1.0.0'}`,

    // Send default PII (user IDs, IPs)
    sendDefaultPii: true,

    // Sample rate for performance monitoring
    tracesSampleRate: 0.1,

    // Scrub sensitive data
    beforeSend(event) {
      // Remove any API keys that might appear in error messages
      if (event.message) {
        event.message = event.message.replace(/sk-ant-[a-zA-Z0-9-]+/g, '[REDACTED_API_KEY]');
        event.message = event.message.replace(/sandbox_[a-zA-Z0-9-]+/g, '[REDACTED_ROOT_KEY]');
      }
      return event;
    },

    ignoreErrors: [
      // Expected auth errors
      'UNAUTHENTICATED',
      'PERMISSION_DENIED',
      // Rate limiting
      'RESOURCE_EXHAUSTED',
    ],
  });

  initialized = true;
  functions.logger.info('[Sentry] Initialized for Cloud Functions');
}

/**
 * Capture an error with extra context.
 */
export function captureError(
  error: Error | string,
  context?: Record<string, unknown>,
): void {
  const err = typeof error === 'string' ? new Error(error) : error;

  if (SENTRY_DSN && initialized) {
    Sentry.captureException(err, {
      extra: context,
    });
  }

  // Always log via Functions logger
  functions.logger.error('[Error]', err.message, context);
}

/**
 * Set user context for Sentry.
 */
export function setSentryUser(userId: string): void {
  if (!SENTRY_DSN || !initialized) return;
  Sentry.setUser({ id: userId });
}

/**
 * Wrap a Cloud Function handler with Sentry error tracking.
 *
 * Automatically:
 *   - Initializes Sentry (if DSN is set)
 *   - Sets user context from auth
 *   - Captures unhandled errors
 *   - Flushes events before function returns
 */
export function wrapFunction<TData, TResult>(
  handler: (data: TData, context: functions.https.CallableContext) => Promise<TResult>,
): (data: TData, context: functions.https.CallableContext) => Promise<TResult> {
  return async (data: TData, context: functions.https.CallableContext): Promise<TResult> => {
    initSentry();

    // Set user context if authenticated
    if (context.auth?.uid) {
      setSentryUser(context.auth.uid);
    }

    try {
      return await handler(data, context);
    } catch (error) {
      captureError(error instanceof Error ? error : new Error(String(error)), {
        functionName: handler.name || 'anonymous',
        userId: context.auth?.uid,
        data: typeof data === 'object' ? JSON.stringify(data).substring(0, 500) : undefined,
      });

      // Flush events before function terminates
      if (SENTRY_DSN && initialized) {
        await Sentry.flush(2000);
      }

      throw error;
    }
  };
}

/**
 * Wrap a Firestore trigger handler with Sentry error tracking.
 */
export function wrapTrigger<T extends (...args: any[]) => Promise<any>>(
  handler: T,
): T {
  return (async (...args: any[]): Promise<void> => {
    initSentry();

    try {
      await handler(...args);
    } catch (error) {
      captureError(error instanceof Error ? error : new Error(String(error)), {
        triggerName: handler.name || 'anonymous',
      });

      if (SENTRY_DSN && initialized) {
        await Sentry.flush(2000);
      }

      throw error;
    }
  }) as unknown as T;
}
