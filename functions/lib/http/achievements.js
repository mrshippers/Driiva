"use strict";
/**
 * ACHIEVEMENTS HTTP CALLABLE
 * ==========================
 * Admin-only callable to seed achievement definitions into Firestore.
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
exports.seedAchievements = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const achievements_1 = require("../utils/achievements");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
const db = (0, firestore_1.getFirestore)();
/**
 * Seed achievement definitions into the top-level `achievements` collection.
 * Callable by admin users only. Idempotent (overwrites existing docs by ID).
 */
exports.seedAchievements = functions
    .region(region_1.EUROPE_LONDON)
    .https.onCall((0, sentry_1.wrapFunction)(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }
    /*
     * This function's own docstring says "Callable by admin users only" and
     * the code checked nothing but the presence of a session, so any signed-in
     * user could rewrite the achievement catalogue every other user reads.
     * The gap between the comment and the check is why it survived review.
     */
    const callerDoc = await db.collection('users').doc(context.auth.uid).get();
    if (callerDoc.data()?.isAdmin !== true) {
        functions.logger.warn('[seedAchievements] non-admin attempt', { uid: context.auth.uid });
        throw new functions.https.HttpsError('permission-denied', 'Admins only.');
    }
    const batch = db.batch();
    for (const def of achievements_1.ACHIEVEMENT_DEFINITIONS) {
        const ref = db.collection('achievements').doc(def.id);
        batch.set(ref, {
            id: def.id,
            name: def.name,
            description: def.description,
            icon: def.icon,
            category: def.category,
            maxProgress: def.maxProgress,
        });
    }
    await batch.commit();
    functions.logger.info(`[seedAchievements] Seeded ${achievements_1.ACHIEVEMENT_DEFINITIONS.length} definitions`);
    return { seeded: achievements_1.ACHIEVEMENT_DEFINITIONS.length };
}));
//# sourceMappingURL=achievements.js.map