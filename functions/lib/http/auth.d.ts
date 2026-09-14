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
import * as functions from 'firebase-functions';
export type CallableContext = functions.https.CallableContext;
/**
 * Require an authenticated user.
 * Throws HttpsError 'unauthenticated' (401) if context.auth is missing.
 * Use this at the start of every callable that requires a signed-in user.
 *
 * @returns context.auth.uid
 */
export declare function requireAuth(context: CallableContext): string;
/**
 * Require that the authenticated user matches the requested userId.
 * Call after requireAuth(). Throws HttpsError 'permission-denied' (403)
 * when requestedUserId !== auth.uid.
 *
 * Use for: quotes, trip actions, pool contribution, etc., so users
 * can only act on their own data.
 */
export declare function requireSelf(context: CallableContext, requestedUserId: string | null | undefined): void;
/**
 * Require admin custom claim.
 * Call after requireAuth(). Throws HttpsError 'permission-denied' (403)
 * when context.auth.token.admin !== true.
 */
export declare function requireAdmin(context: CallableContext): void;
//# sourceMappingURL=auth.d.ts.map