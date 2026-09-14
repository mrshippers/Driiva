/**
 * ADMIN & CALLABLE HTTP FUNCTIONS
 * ================================
 * HTTP callable functions for admin operations and
 * client operations that require admin SDK (writes to protected collections).
 *
 * All callables use shared auth: requireAuth (401 if missing/expired token),
 * requireSelf or requireAdmin for authorization (403 if not allowed).
 */
import * as functions from 'firebase-functions';
/**
 * Initialize community pool (admin only)
 * Call this once to set up the pool document
 */
export declare const initializePool: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Cancel a trip (mark as failed)
 *
 * This is a callable function because:
 * - Trip documents cannot be updated by clients (security rules: allow update: if false)
 * - Only the admin SDK can update trip status
 */
export declare const cancelTrip: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Add contribution to pool (called after payment is processed)
 *
 * This is a callable function because:
 * - communityPool and poolShares collections require admin SDK to write
 * - Client-side security rules prevent direct writes to these collections
 * - This ensures atomic, transactional updates across multiple collections
 *
 * Authorization: userId is always context.auth.uid (no client-supplied userId).
 */
export declare const addPoolContribution: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=admin.d.ts.map