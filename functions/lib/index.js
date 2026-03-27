"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.health = exports.seedAchievements = exports.onUserUpdateRecalcBetaEstimate = exports.calculateBetaEstimateForUser = exports.syncInsurancePolicy = exports.acceptInsuranceQuote = exports.getInsuranceQuote = exports.getAIInsights = exports.analyzeTripAI = exports.deleteUserAccount = exports.exportUserData = exports.batchClassifyTrips = exports.classifyTrip = exports.cancelTrip = exports.addPoolContribution = exports.initializePool = exports.monitorTripHealth = exports.syncDamoovTrips = exports.sendWeeklySummary = exports.recalculatePoolShares = exports.finalizePoolPeriod = exports.updateLeaderboards = exports.onPendingPaymentWrite = exports.syncTripOnComplete = exports.syncUserOnSignup = exports.onUserCreate = exports.onPoolShareWrite = exports.onPolicyWrite = exports.onTripStatusChange = exports.onTripCreate = exports.db = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// Export Firestore instance for other modules
exports.db = admin.firestore();
// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================
var trips_1 = require("./triggers/trips");
Object.defineProperty(exports, "onTripCreate", { enumerable: true, get: function () { return trips_1.onTripCreate; } });
Object.defineProperty(exports, "onTripStatusChange", { enumerable: true, get: function () { return trips_1.onTripStatusChange; } });
var policies_1 = require("./triggers/policies");
Object.defineProperty(exports, "onPolicyWrite", { enumerable: true, get: function () { return policies_1.onPolicyWrite; } });
var pool_1 = require("./triggers/pool");
Object.defineProperty(exports, "onPoolShareWrite", { enumerable: true, get: function () { return pool_1.onPoolShareWrite; } });
var users_1 = require("./triggers/users");
Object.defineProperty(exports, "onUserCreate", { enumerable: true, get: function () { return users_1.onUserCreate; } });
var syncUserOnSignup_1 = require("./triggers/syncUserOnSignup");
Object.defineProperty(exports, "syncUserOnSignup", { enumerable: true, get: function () { return syncUserOnSignup_1.syncUserOnSignup; } });
var syncTripOnComplete_1 = require("./triggers/syncTripOnComplete");
Object.defineProperty(exports, "syncTripOnComplete", { enumerable: true, get: function () { return syncTripOnComplete_1.syncTripOnComplete; } });
var payments_1 = require("./triggers/payments");
Object.defineProperty(exports, "onPendingPaymentWrite", { enumerable: true, get: function () { return payments_1.onPendingPaymentWrite; } });
// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================
var leaderboard_1 = require("./scheduled/leaderboard");
Object.defineProperty(exports, "updateLeaderboards", { enumerable: true, get: function () { return leaderboard_1.updateLeaderboards; } });
var pool_2 = require("./scheduled/pool");
Object.defineProperty(exports, "finalizePoolPeriod", { enumerable: true, get: function () { return pool_2.finalizePoolPeriod; } });
Object.defineProperty(exports, "recalculatePoolShares", { enumerable: true, get: function () { return pool_2.recalculatePoolShares; } });
var notifications_1 = require("./scheduled/notifications");
Object.defineProperty(exports, "sendWeeklySummary", { enumerable: true, get: function () { return notifications_1.sendWeeklySummary; } });
var damoovSync_1 = require("./scheduled/damoovSync");
Object.defineProperty(exports, "syncDamoovTrips", { enumerable: true, get: function () { return damoovSync_1.syncDamoovTrips; } });
var watchdog_1 = require("./scheduled/watchdog");
Object.defineProperty(exports, "monitorTripHealth", { enumerable: true, get: function () { return watchdog_1.monitorTripHealth; } });
// ============================================================================
// HTTP CALLABLE FUNCTIONS
// ============================================================================
// Admin functions
var admin_1 = require("./http/admin");
Object.defineProperty(exports, "initializePool", { enumerable: true, get: function () { return admin_1.initializePool; } });
// User-callable functions (require admin SDK for protected collection writes)
var admin_2 = require("./http/admin");
Object.defineProperty(exports, "addPoolContribution", { enumerable: true, get: function () { return admin_2.addPoolContribution; } });
Object.defineProperty(exports, "cancelTrip", { enumerable: true, get: function () { return admin_2.cancelTrip; } });
// Trip classification (Stop-Go-Classifier integration)
var classifier_1 = require("./http/classifier");
Object.defineProperty(exports, "classifyTrip", { enumerable: true, get: function () { return classifier_1.classifyTrip; } });
Object.defineProperty(exports, "batchClassifyTrips", { enumerable: true, get: function () { return classifier_1.batchClassifyTrips; } });
// GDPR: data export and account deletion
var gdpr_1 = require("./http/gdpr");
Object.defineProperty(exports, "exportUserData", { enumerable: true, get: function () { return gdpr_1.exportUserData; } });
Object.defineProperty(exports, "deleteUserAccount", { enumerable: true, get: function () { return gdpr_1.deleteUserAccount; } });
// AI Trip Analysis (Claude Sonnet 4 integration)
var aiAnalysis_1 = require("./http/aiAnalysis");
Object.defineProperty(exports, "analyzeTripAI", { enumerable: true, get: function () { return aiAnalysis_1.analyzeTripAI; } });
Object.defineProperty(exports, "getAIInsights", { enumerable: true, get: function () { return aiAnalysis_1.getAIInsights; } });
// Insurance (Root Platform integration)
var insurance_1 = require("./http/insurance");
Object.defineProperty(exports, "getInsuranceQuote", { enumerable: true, get: function () { return insurance_1.getInsuranceQuote; } });
Object.defineProperty(exports, "acceptInsuranceQuote", { enumerable: true, get: function () { return insurance_1.acceptInsuranceQuote; } });
Object.defineProperty(exports, "syncInsurancePolicy", { enumerable: true, get: function () { return insurance_1.syncInsurancePolicy; } });
// Beta estimate (non-binding premium + refund calculator)
var betaEstimate_1 = require("./http/betaEstimate");
Object.defineProperty(exports, "calculateBetaEstimateForUser", { enumerable: true, get: function () { return betaEstimate_1.calculateBetaEstimateForUser; } });
Object.defineProperty(exports, "onUserUpdateRecalcBetaEstimate", { enumerable: true, get: function () { return betaEstimate_1.onUserUpdateRecalcBetaEstimate; } });
// Achievements: seed definitions (admin)
var achievements_1 = require("./http/achievements");
Object.defineProperty(exports, "seedAchievements", { enumerable: true, get: function () { return achievements_1.seedAchievements; } });
// ============================================================================
// HTTP REQUEST (PUBLIC) — Uptime monitoring
// ============================================================================
var health_1 = require("./http/health");
Object.defineProperty(exports, "health", { enumerable: true, get: function () { return health_1.health; } });
//# sourceMappingURL=index.js.map