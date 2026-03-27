"use strict";
/**
 * SYNC USER ON SIGNUP
 * ===================
 * Firebase Auth trigger: when a new user is created, mirror them to Neon PostgreSQL.
 * This keeps users + onboarding_complete as single source of truth in PostgreSQL.
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
exports.syncUserOnSignup = void 0;
const functions = __importStar(require("firebase-functions"));
const neon_1 = require("../lib/neon");
const region_1 = require("../lib/region");
const sentry_1 = require("../lib/sentry");
exports.syncUserOnSignup = functions
    .region(region_1.EUROPE_LONDON)
    .runWith({ secrets: ['DATABASE_URL'] })
    .auth.user().onCreate((0, sentry_1.wrapTrigger)(async (user) => {
    const { uid, email, displayName } = user;
    const emailStr = email ?? '';
    if (!emailStr) {
        functions.logger.warn('User created without email', { uid });
        return;
    }
    try {
        const pgId = await (0, neon_1.insertUserFromFirebase)(uid, emailStr, displayName ?? null);
        functions.logger.info('Synced Firebase user to PostgreSQL', { uid, email: emailStr, pgUserId: pgId });
    }
    catch (error) {
        functions.logger.error('Failed to sync user to PostgreSQL', { uid, error });
        throw error;
    }
}));
//# sourceMappingURL=syncUserOnSignup.js.map