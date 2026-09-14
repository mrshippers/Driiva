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
exports.trackAPIUsage = trackAPIUsage;
/**
 * Step 6 of the trip analyser: record token spend against the AI usage
 * collection. Extracted verbatim from functions/src/ai/tripAnalysis.ts.
 */
const firestore_1 = require("firebase-admin/firestore");
const functions = __importStar(require("firebase-functions"));
const types_1 = require("../types");
const firestoreDb_1 = require("./firestoreDb");
const config_1 = require("./config");
// ---------------------------------------------------------------------------
// STEP 6: API USAGE TRACKING
// ---------------------------------------------------------------------------
async function trackAPIUsage(tripId, userId, promptTokens, completionTokens, latencyMs, success, error) {
    try {
        const totalTokens = promptTokens + completionTokens;
        const estimatedCostCents = Math.ceil((promptTokens * config_1.COST_INPUT_PER_M + completionTokens * config_1.COST_OUTPUT_PER_M) / 1000000);
        const usageDoc = {
            tripId,
            userId,
            model: config_1.CLAUDE_MODEL,
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostCents,
            latencyMs,
            success,
            error,
            calledAt: firestore_1.Timestamp.now(),
        };
        await firestoreDb_1.db.collection(types_1.COLLECTION_NAMES.AI_USAGE_TRACKING).add(usageDoc);
        functions.logger.info('[metric] ai_analysis', {
            metric: 'ai_analysis',
            tripId,
            userId,
            success,
            latencyMs,
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostCents,
            model: config_1.CLAUDE_MODEL,
            error,
        });
    }
    catch (trackingError) {
        // Don't let tracking failure break the analysis pipeline
        functions.logger.warn('[AI] Failed to track API usage:', trackingError);
    }
}
//# sourceMappingURL=apiUsage.js.map