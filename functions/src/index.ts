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

// Initialize Firebase Admin
admin.initializeApp();

// Export Firestore instance for other modules
export const db = admin.firestore();

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

export { onTripCreate, onTripStatusChange } from './triggers/trips';
export { onPolicyWrite } from './triggers/policies';
export { onPoolShareWrite } from './triggers/pool';
export { onUserCreate } from './triggers/users';
export { syncUserOnSignup } from './triggers/syncUserOnSignup';
export { syncTripOnComplete } from './triggers/syncTripOnComplete';
export { onPendingPaymentWrite } from './triggers/payments';

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

export { updateLeaderboards } from './scheduled/leaderboard';
export { finalizePoolPeriod, recalculatePoolShares } from './scheduled/pool';
export { sendWeeklySummary } from './scheduled/notifications';
export { syncDamoovTrips } from './scheduled/damoovSync';
export { monitorTripHealth } from './scheduled/watchdog';
export { enforceDataRetention } from './scheduled/retention';
export { dailyFirestoreBackup } from './scheduled/backup';

// ============================================================================
// HTTP CALLABLE FUNCTIONS
// ============================================================================

// Admin functions
export { initializePool } from './http/admin';

// User-callable functions (require admin SDK for protected collection writes)
export { addPoolContribution, cancelTrip } from './http/admin';

// Trip classification (Stop-Go-Classifier integration)
export { classifyTrip, batchClassifyTrips } from './http/classifier';

// GDPR: data export and account deletion
export { exportUserData, deleteUserAccount } from './http/gdpr';

// AI Trip Analysis (Claude Sonnet 4 integration)
export { analyzeTripAI, getAIInsights } from './http/aiAnalysis';

// Insurance (Root Platform integration)
export { getInsuranceQuote, acceptInsuranceQuote, syncInsurancePolicy } from './http/insurance';

// Beta estimate (non-binding premium + refund calculator)
export {
  calculateBetaEstimateForUser,
  onUserUpdateRecalcBetaEstimate,
} from './http/betaEstimate';

// Achievements: seed definitions (admin)
export { seedAchievements } from './http/achievements';

// ============================================================================
// HTTP REQUEST (PUBLIC) — Uptime monitoring
// ============================================================================

export { health } from './http/health';
