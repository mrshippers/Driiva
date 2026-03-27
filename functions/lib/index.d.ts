/**
 * DRIIVA CLOUD FUNCTIONS
 * ======================
 * Firebase Cloud Functions for Driiva telematics app.
 *
 * Triggers:
 *   - onTripCreate: Initial trip validation and enrichment
 *   - onTripStatusChange:
 *       • recording → processing: Finalize trip (compute metrics from GPS points)
 *       • processing → completed: Manual approval (update driver profile)
 *   - onPolicyWrite: Sync policy to user document
 *   - onPoolShareWrite: Sync pool share to user document
 *
 * Scheduled:
 *   - updateLeaderboards: Every 15 minutes
 *   - finalizePoolPeriod: 1st of each month
 *   - syncDamoovTrips: Daily 00:30 UK (Damoov DataHub → Firestore trips + profiles)
 *
 * HTTP Callable:
 *   - initializePool: Admin-only pool setup
 *   - addPoolContribution: Add premium contribution to pool
 *   - cancelTrip: Cancel an in-progress trip
 *   - classifyTrip: Classify trip stops/segments (Stop-Go-Classifier)
 *   - batchClassifyTrips: Admin batch classification
 *   - analyzeTripAI: On-demand AI trip analysis (Claude Sonnet 4)
 *   - getAIInsights: Retrieve AI insights for a trip
 *
 * HTTP Request (public, no auth):
 *   - health: GET /health for uptime monitoring (200/503)
 */
import * as admin from 'firebase-admin';
export declare const db: admin.firestore.Firestore;
export { onTripCreate, onTripStatusChange } from './triggers/trips';
export { onPolicyWrite } from './triggers/policies';
export { onPoolShareWrite } from './triggers/pool';
export { onUserCreate } from './triggers/users';
export { syncUserOnSignup } from './triggers/syncUserOnSignup';
export { syncTripOnComplete } from './triggers/syncTripOnComplete';
export { onPendingPaymentWrite } from './triggers/payments';
export { updateLeaderboards } from './scheduled/leaderboard';
export { finalizePoolPeriod, recalculatePoolShares } from './scheduled/pool';
export { sendWeeklySummary } from './scheduled/notifications';
export { syncDamoovTrips } from './scheduled/damoovSync';
export { monitorTripHealth } from './scheduled/watchdog';
export { initializePool } from './http/admin';
export { addPoolContribution, cancelTrip } from './http/admin';
export { classifyTrip, batchClassifyTrips } from './http/classifier';
export { exportUserData, deleteUserAccount } from './http/gdpr';
export { analyzeTripAI, getAIInsights } from './http/aiAnalysis';
export { getInsuranceQuote, acceptInsuranceQuote, syncInsurancePolicy } from './http/insurance';
export { calculateBetaEstimateForUser, onUserUpdateRecalcBetaEstimate, } from './http/betaEstimate';
export { seedAchievements } from './http/achievements';
export { health } from './http/health';
//# sourceMappingURL=index.d.ts.map