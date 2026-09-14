/**
 * GDPR DATA EXPORT & ACCOUNT DELETION
 * ===================================
 * UK GDPR: right to data portability (export) and right to erasure (delete).
 * - exportUserData: returns all user data as JSON (for download).
 * - deleteUserAccount: deletes all user data and Firebase Auth account.
 */
import * as functions from 'firebase-functions';
/**
 * Export all user data for GDPR data portability.
 * Authenticated user must request their own userId.
 */
export declare const exportUserData: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Delete user account and all associated data (GDPR right to erasure).
 * Uses batched deletes for atomicity where possible; then deletes Firebase Auth user.
 */
export declare const deleteUserAccount: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=gdpr.d.ts.map