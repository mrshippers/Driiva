"use strict";
/**
 * AUTH HELPERS FOR HTTP CALLABLE FUNCTIONS
 * =========================================
 * Centralized authentication and authorization for Cloud Functions.
 *
 * - Firebase callables automatically verify the ID token; if invalid or
 *   expired, context.auth is undefined (we treat as 401).
 * - Expired tokens: Firebase does not populate context.auth, so we return
 *   a message that asks the user to sign in again.
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
exports.requireAuth = requireAuth;
exports.requireSelf = requireSelf;
exports.requireAdmin = requireAdmin;
const functions = __importStar(require("firebase-functions"));
/** Message for unauthenticated requests (missing or expired token). */
const UNAUTHENTICATED_MESSAGE = 'Authentication required. If you were signed in, your session may have expired - please sign in again.';
/**
 * Require an authenticated user.
 * Throws HttpsError 'unauthenticated' (401) if context.auth is missing.
 * Use this at the start of every callable that requires a signed-in user.
 *
 * @returns context.auth.uid
 */
function requireAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', UNAUTHENTICATED_MESSAGE);
    }
    return context.auth.uid;
}
/**
 * Require that the authenticated user matches the requested userId.
 * Call after requireAuth(). Throws HttpsError 'permission-denied' (403)
 * when requestedUserId !== auth.uid.
 *
 * Use for: quotes, trip actions, pool contribution, etc., so users
 * can only act on their own data.
 */
function requireSelf(context, requestedUserId) {
    if (requestedUserId == null || requestedUserId === '') {
        throw new functions.https.HttpsError('invalid-argument', 'userId is required');
    }
    if (!context.auth || context.auth.uid !== requestedUserId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only access or modify your own data');
    }
}
/**
 * Require admin custom claim.
 * Call after requireAuth(). Throws HttpsError 'permission-denied' (403)
 * when context.auth.token.admin !== true.
 */
function requireAdmin(context) {
    if (!context.auth?.token?.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
}
//# sourceMappingURL=auth.js.map