/**
 * AUTH HELPERS FOR HTTP CALLABLE FUNCTIONS
 * =========================================
 * Centralized authentication and authorization for Cloud Functions.
 *
 * - Firebase callables automatically verify the ID token; if invalid or
 *   expired, context.auth is undefined (we treat as 401).
 * - Expired tokens: Firebase does not populate context.auth, so we return
 *   a message that asks the user to sign in again.
 */

import * as functions from 'firebase-functions/v1';

export type CallableContext = functions.https.CallableContext;

/** Message for unauthenticated requests (missing or expired token). */
const UNAUTHENTICATED_MESSAGE =
  'Authentication required. If you were signed in, your session may have expired - please sign in again.';

/**
 * Require an authenticated user.
 * Throws HttpsError 'unauthenticated' (401) if context.auth is missing.
 * Use this at the start of every callable that requires a signed-in user.
 *
 * @returns context.auth.uid
 */
export function requireAuth(context: CallableContext): string {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      UNAUTHENTICATED_MESSAGE
    );
  }
  return context.auth.uid;
}

/**
 * Require that the authenticated user matches the requested userId.
 * Call after requireAuth(). Throws HttpsError 'permission-denied' (403)
 * when requestedUserId !== auth.uid.
 *
 * Use for: quotes, trip actions, pool contribution, etc., so users
 * can only act on their own data.
 */
export function requireSelf(
  context: CallableContext,
  requestedUserId: string | null | undefined
): void {
  if (requestedUserId == null || requestedUserId === '') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'userId is required'
    );
  }
  if (!context.auth || context.auth.uid !== requestedUserId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'You can only access or modify your own data'
    );
  }
}

/**
 * Require admin custom claim.
 * Call after requireAuth(). Throws HttpsError 'permission-denied' (403)
 * when context.auth.token.admin !== true.
 */
export function requireAdmin(context: CallableContext): void {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }
}
