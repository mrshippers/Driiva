"use strict";
/**
 * SCHEDULED NOTIFICATIONS
 * =======================
 * Sends weekly driving summary push notifications every Monday at 9am UK time.
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
exports.sendWeeklySummary = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const notifications_1 = require("../utils/notifications");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = admin.firestore();
/**
 * Send weekly driving summary to all active users.
 * Runs every Monday at 9:00 AM UK time.
 */
exports.sendWeeklySummary = functions
    .region(region_1.EUROPE_LONDON)
    .pubsub.schedule('0 9 * * 1') // Every Monday 9 AM
    .timeZone('Europe/London')
    .onRun((0, sentry_1.wrapTrigger)(async () => {
    functions.logger.info('[WeeklySummary] Starting weekly summary notifications');
    try {
        const usersSnap = await db
            .collection(types_1.COLLECTION_NAMES.USERS)
            .where('settings.notificationsEnabled', '==', true)
            .get();
        let sent = 0;
        let skipped = 0;
        for (const userDoc of usersSnap.docs) {
            const user = userDoc.data();
            const profile = user.drivingProfile;
            if (!profile || profile.totalTrips === 0 || !user.fcmTokens?.length) {
                skipped++;
                continue;
            }
            try {
                await (0, notifications_1.sendWeeklySummaryToUser)(userDoc.id, Math.round(profile.currentScore), profile.totalTrips, Math.round(profile.totalMiles));
                sent++;
            }
            catch (err) {
                functions.logger.warn(`[WeeklySummary] Failed for user ${userDoc.id}:`, err);
            }
        }
        functions.logger.info(`[WeeklySummary] Done: ${sent} sent, ${skipped} skipped`);
    }
    catch (err) {
        functions.logger.error('[WeeklySummary] Fatal error:', err);
        throw err;
    }
}));
//# sourceMappingURL=notifications.js.map