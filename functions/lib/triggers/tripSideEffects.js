"use strict";
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
exports.checkDpiaCompliance = checkDpiaCompliance;
exports.classifyCompletedTripAsync = classifyCompletedTripAsync;
exports.isAIInsightsEnabled = isAIInsightsEnabled;
exports.analyzeCompletedTripAsync = analyzeCompletedTripAsync;
exports.checkAchievementsAsync = checkAchievementsAsync;
/**
 * The fire-and-forget work that hangs off a completed trip: the DPIA field
 * audit, the stop-go classifier, the Claude analysis and the achievement
 * check. Each is deliberately not awaited by the trigger, so a failure here
 * never fails the trip write. Extracted verbatim from
 * functions/src/triggers/trips.ts.
 */
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const types_1 = require("../types");
const achievements_1 = require("../utils/achievements");
const notifications_1 = require("../utils/notifications");
const classifier_1 = require("../http/classifier");
const tripAnalysis_1 = require("../ai/tripAnalysis");
const db_1 = require("../lib/db");
// ─── DPIA SAFEGUARD ─────────────────────────────────────────────────────────
// Approved data fields for trip point processing. Any new field types added to
// tripPoints documents that aren't in this list will trigger a warning log and
// a Firestore flag at admin/dpiaAlerts. This is an architectural safeguard for
// future GDPR compliance - trips still process normally.
//
// Before adding new sensor types to trip collection, a Data Protection Impact
// Assessment (DPIA) must be completed per UK GDPR Art. 35 for high-risk
// processing of location/behavioural data at scale.
const DPIA_REVIEWED_DATA_TYPES = new Set([
    't', 'lat', 'lng', 'spd', 'hdg', 'acc', // Core GPS fields
    'ax', 'ay', 'az', // Accelerometer
    'gx', 'gy', 'gz', // Gyroscope
]);
/**
 * Non-blocking check: flag any unreviewed data types in trip points.
 * Writes an alert to admin/dpiaAlerts if new fields are detected.
 */
async function checkDpiaCompliance(tripId, points) {
    if (!points.length)
        return;
    const sample = points[0];
    const unreviewedFields = Object.keys(sample).filter((key) => !DPIA_REVIEWED_DATA_TYPES.has(key));
    if (unreviewedFields.length > 0) {
        functions.logger.warn('DPIA REVIEW REQUIRED: new data type detected in trip points', {
            tripId,
            fields: unreviewedFields,
        });
        try {
            const alertRef = db_1.db.collection('admin').doc('dpiaAlerts');
            await alertRef.set({
                lastAlertAt: firestore_1.FieldValue.serverTimestamp(),
                unreviewedFields: firestore_1.FieldValue.arrayUnion(...unreviewedFields),
                [`alerts.${tripId}`]: {
                    fields: unreviewedFields,
                    detectedAt: new Date().toISOString(),
                },
            }, { merge: true });
        }
        catch (err) {
            functions.logger.error('Failed to write DPIA alert', { tripId, err });
        }
    }
}
/**
 * Async wrapper for trip classification
 *
 * Calls the Stop-Go-Classifier Python function without blocking trip processing.
 * Classification is an enhancement, not critical to trip completion.
 */
function classifyCompletedTripAsync(tripId, trip) {
    // Fire and forget - don't await
    (0, classifier_1.classifyCompletedTrip)(tripId, trip)
        .catch(error => {
        functions.logger.warn(`Non-blocking classification error for trip ${tripId}:`, error);
    });
}
/**
 * Check whether AI insights feature flag is enabled.
 *
 * Set via environment variable FEATURE_AI_INSIGHTS (default: "true").
 * Disable by setting it to "false" in Cloud Functions config / .env.
 */
function isAIInsightsEnabled() {
    const flag = process.env.FEATURE_AI_INSIGHTS ?? 'true';
    return flag.toLowerCase() === 'true';
}
/**
 * Async wrapper for AI trip analysis
 *
 * Calls Claude Sonnet 4 to generate advanced driving insights.
 * Non-blocking: the driver sees the algorithmic score immediately,
 * and AI insights are layered on asynchronously (typically < 5 s).
 *
 * Gated by the FEATURE_AI_INSIGHTS environment variable.
 */
function analyzeCompletedTripAsync(tripId, trip, points, profile) {
    if (!isAIInsightsEnabled()) {
        functions.logger.info(`[AI] Feature flag disabled, skipping analysis for trip ${tripId}`);
        return;
    }
    (0, tripAnalysis_1.analyzeTrip)(tripId, trip, points, profile)
        .then(result => {
        if (result) {
            functions.logger.info(`[AI] Trip ${tripId} analysis completed`);
        }
    })
        .catch(error => {
        functions.logger.warn(`Non-blocking AI analysis error for trip ${tripId}:`, error);
    });
}
/**
 * Async wrapper for achievement checking + push notifications.
 * Non-blocking: these are enhancements, not critical to trip completion.
 */
function checkAchievementsAsync(userId, trip, tripId) {
    (async () => {
        try {
            // Send trip-complete push notification
            (0, notifications_1.notifyTripComplete)(userId, tripId, trip.score).catch(err => functions.logger.warn(`[Push] Trip-complete notification error:`, err));
            // Check & unlock achievements
            const userDoc = await db_1.db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).get();
            if (!userDoc.exists)
                return;
            const profile = userDoc.data().drivingProfile;
            const unlocked = await (0, achievements_1.checkAndUnlockAchievements)(userId, profile, trip, tripId);
            if (unlocked.length > 0) {
                functions.logger.info(`[Achievements] Unlocked ${unlocked.length} for user ${userId}: ${unlocked.join(', ')}`);
                const names = unlocked
                    .map(id => achievements_1.ACHIEVEMENT_DEFINITIONS.find(d => d.id === id)?.name)
                    .filter(Boolean);
                (0, notifications_1.notifyAchievementsUnlocked)(userId, names).catch(err => functions.logger.warn(`[Push] Achievement notification error:`, err));
            }
        }
        catch (err) {
            functions.logger.warn(`[Achievements] Non-blocking error for user ${userId}:`, err);
        }
    })();
}
//# sourceMappingURL=tripSideEffects.js.map