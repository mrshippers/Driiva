/**
 * POOL SCHEDULED FUNCTIONS
 * ========================
 * Scheduled functions for community pool management.
 */
import * as functions from 'firebase-functions';
/**
 * Finalize pool period on the 1st of each month
 * - Mark all shares as finalized
 * - Calculate final refund amounts
 * - Prepare for payout
 */
export declare const finalizePoolPeriod: functions.CloudFunction<unknown>;
/**
 * Recalculate pool share projections daily
 * Updates projected refund amounts based on current pool state
 */
export declare const recalculatePoolShares: functions.CloudFunction<unknown>;
//# sourceMappingURL=pool.d.ts.map