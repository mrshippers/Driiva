"use strict";
/**
 * HEALTH CHECK ENDPOINT
 * =====================
 * Public GET endpoint for external uptime monitoring (e.g. UptimeRobot).
 * No auth required. Returns 200 when healthy, 503 when a dependency check fails.
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
exports.health = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const region_1 = require("../lib/region");
const db = admin.firestore();
const FIRESTORE_CHECK_TIMEOUT_MS = 5000;
exports.health = functions
    .region(region_1.EUROPE_LONDON)
    .https.onRequest(async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).set('Allow', 'GET').send();
        return;
    }
    const timestamp = new Date().toISOString();
    try {
        // Lightweight Firestore reachability check with timeout
        const firestoreOk = await Promise.race([
            db.collection(types_1.COLLECTION_NAMES.USERS).limit(1).get(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore check timeout')), FIRESTORE_CHECK_TIMEOUT_MS)),
        ]).then(() => true, () => false);
        if (!firestoreOk) {
            res.status(503).json({
                status: 'unhealthy',
                reason: 'firestore',
                service: 'driiva-functions',
                timestamp,
            });
            return;
        }
        res.status(200).json({
            status: 'healthy',
            service: 'driiva-functions',
            version: process.env.npm_package_version || '1.0.0',
            region: 'europe-west2',
            timestamp,
            checks: {
                firestore: 'ok',
            },
        });
    }
    catch (e) {
        functions.logger.warn('[health] Dependency check failed', { error: String(e) });
        res.status(503).json({
            status: 'unhealthy',
            reason: 'firestore',
            service: 'driiva-functions',
            timestamp,
        });
    }
});
//# sourceMappingURL=health.js.map