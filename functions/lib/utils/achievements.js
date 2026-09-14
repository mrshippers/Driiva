"use strict";
/**
 * ACHIEVEMENTS ENGINE
 * ===================
 * Checks and unlocks achievements based on driving profile and trip data.
 * Called after each trip completion in a non-blocking fire-and-forget manner.
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
exports.ACHIEVEMENT_DEFINITIONS = void 0;
exports.checkAndUnlockAchievements = checkAndUnlockAchievements;
const firestore_1 = require("firebase-admin/firestore");
const functions = __importStar(require("firebase-functions"));
const contracts_1 = require("@driiva/contracts");
const types_1 = require("../types");
const db = (0, firestore_1.getFirestore)();
/**
 * The unlock predicates. Metadata (name, description, icon, category,
 * maxProgress) lives in @driiva/contracts so the client can render the
 * catalogue without depending on a seeded Firestore collection; only the
 * decision about what is EARNED lives here, which is authority the client
 * must never hold.
 *
 * Keyed by id and exhaustively checked against the shared catalogue below, so
 * adding a badge to contracts without a predicate fails loudly at module load
 * rather than silently never unlocking for anybody.
 */
const CHECKS = {
    'first-trip': (profile) => profile.totalTrips >= 1,
    'smooth-operator': (profile) => profile.totalTrips >= 10,
    'century-club': (profile) => profile.totalTrips >= 100,
    'high-scorer': (profile) => profile.currentScore >= 90,
    'road-warrior': (profile) => profile.totalMiles >= 500,
    'streak-master': (profile) => profile.streakDays >= 7,
    'night-owl': (_profile, trip) => {
        const startHour = trip.startedAt?.toDate?.()?.getHours?.() ?? 12;
        return startHour >= 21 && trip.score >= 70;
    },
    'perfect-score': (_profile, trip) => trip.score >= 100,
};
exports.ACHIEVEMENT_DEFINITIONS = contracts_1.ACHIEVEMENT_META.map((meta) => {
    const check = CHECKS[meta.id];
    if (!check) {
        throw new Error(`[Achievements] "${meta.id}" is in the shared catalogue with no unlock predicate. ` +
            'It would render to users as permanently locked.');
    }
    return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        icon: meta.icon,
        category: meta.category,
        maxProgress: meta.maxProgress,
        check,
    };
});
/**
 * Check and unlock eligible achievements for a user after a trip.
 * Returns an array of achievement IDs that were newly unlocked.
 */
async function checkAndUnlockAchievements(userId, profile, trip, tripId) {
    const userAchRef = db.collection(types_1.COLLECTION_NAMES.USERS).doc(userId).collection('achievements');
    const existingSnap = await userAchRef.get();
    const alreadyUnlocked = new Set(existingSnap.docs.map(d => d.id));
    const newlyUnlocked = [];
    for (const def of exports.ACHIEVEMENT_DEFINITIONS) {
        if (alreadyUnlocked.has(def.id))
            continue;
        try {
            if (def.check(profile, trip)) {
                await userAchRef.doc(def.id).set({
                    achievementId: def.id,
                    unlockedAt: firestore_1.FieldValue.serverTimestamp(),
                    tripId,
                });
                newlyUnlocked.push(def.id);
            }
        }
        catch (err) {
            functions.logger.warn(`[Achievements] Error checking ${def.id}:`, err);
        }
    }
    return newlyUnlocked;
}
//# sourceMappingURL=achievements.js.map