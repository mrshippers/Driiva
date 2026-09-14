"use strict";
/**
 * ROOT ADAPTER - typed interface seam over the Root Platform HTTP integration
 * ============================================================================
 * M4 Task 4 (structural seam only, per .superpowers/sdd/m4-plan/task-4-brief.md
 * and m4-grounding.md section 4): extracts the quote/bind/sync/cancel
 * operations that `insurance.ts` already models behind a typed `RootAdapter`
 * interface, with `RootHttpAdapter` as the sole concrete implementation.
 *
 * IMPORTANT - this is NOT a functional fix:
 *  - No Root sandbox credentials exist (Doppler check failed this session,
 *    treat as unavailable). The HTTP calls below are exactly as unverified as
 *    they were before this refactor - do not read this file as evidence the
 *    Root integration works end to end.
 *  - D15 (Root/FCA operating model) is unconfirmed. `RootHttpAdapter.cancel`
 *    in particular has no prior live call to preserve behaviour from (no
 *    cancellation primitive existed anywhere pre-M4 - see grounding section
 *    2/4) - it is new, modelled on the same PATCH pattern the rest of this
 *    file already uses, and is exactly as unverified as everything else here.
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
exports.RootHttpAdapter = void 0;
exports.resolveCurrency = resolveCurrency;
exports.getRootConfig = getRootConfig;
const functions = __importStar(require("firebase-functions"));
// ============================================================================
// CURRENCY SEAM
// ============================================================================
/**
 * PINNED DECISION (ZAR-vs-GBP, from insurance.ts / m4-grounding.md sections 2
 * and 4; tracked as ROADMAP.md TD-4):
 * Root's sandbox models all monetary values in ZAR cents. Driiva is a UK GBP
 * product. There is currently NO conversion applied anywhere in this module -
 * `rootQuote.suggested_premium` / `monthly_premium` etc. are passed straight
 * through as if they were GBP pence. This function exists so that mismatch has
 * one named, greppable location instead of being silently baked into every
 * call site. Do NOT invent a conversion rate here - a real one requires either
 * (a) confirming Root's UK/GBP product module key once sandbox creds exist, or
 * (b) an explicit FX rate signed off as part of D15. Until then this is an
 * identity function that returns its input unchanged, so behaviour is
 * unchanged from pre-seam code - it just makes the gap impossible to miss.
 */
function resolveCurrency(amountMinorUnits) {
    // Identity pass-through, deliberately. See the comment above and
    // ROADMAP.md TD-4 - do not guess a conversion rate here.
    return amountMinorUnits;
}
function getRootConfig() {
    const apiKey = process.env.ROOT_API_KEY;
    const productModuleKey = process.env.ROOT_PRODUCT_MODULE_KEY;
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'Root Platform API key is not configured. Set ROOT_API_KEY in functions environment.');
    }
    if (!productModuleKey) {
        throw new functions.https.HttpsError('failed-precondition', 'Root product module key is not configured. Set ROOT_PRODUCT_MODULE_KEY in functions environment.');
    }
    return {
        apiKey,
        apiUrl: process.env.ROOT_API_URL || 'https://api.rootplatform.com/v1/insurance',
        environment: (process.env.ROOT_ENVIRONMENT || 'sandbox'),
        productModuleKey,
    };
}
async function rootApiFetch(transport, options) {
    const config = getRootConfig();
    const url = `${config.apiUrl}${options.path}`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${config.apiKey}:`).toString('base64')}`,
    };
    const response = await transport(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) {
        const errorBody = await response.text();
        functions.logger.error(`[Root API] ${options.method} ${options.path} failed`, {
            status: response.status,
            body: errorBody,
        });
        throw new functions.https.HttpsError('internal', `Root Platform API error (${response.status}): ${errorBody}`);
    }
    return response.json();
}
/**
 * The sole concrete implementation of RootAdapter. Behaviour (paths, method
 * verbs, request bodies) is unchanged from insurance.ts's pre-seam inline
 * calls - this is a structural extraction, not a fix. `cancel` is the one
 * genuinely new method (see file header) and is exactly as unverified as the
 * rest.
 */
class RootHttpAdapter {
    constructor(transport = fetch) {
        this.transport = transport;
    }
    quote(request) {
        return rootApiFetch(this.transport, {
            method: 'POST',
            path: '/quotes',
            body: request,
        });
    }
    ensurePolicyholder(input) {
        return rootApiFetch(this.transport, {
            method: 'POST',
            path: '/policyholders',
            body: {
                first_name: input.firstName,
                last_name: input.lastName,
                email: input.email,
                id: input.userId,
            },
        });
    }
    bind(request) {
        return rootApiFetch(this.transport, {
            method: 'POST',
            path: '/applications',
            body: request,
        });
    }
    getPolicy(policyId) {
        return rootApiFetch(this.transport, {
            method: 'GET',
            path: `/policies/${policyId}`,
        });
    }
    sync(policyId) {
        return this.getPolicy(policyId);
    }
    // NEW - no prior cancellation primitive existed in this codebase (grounding
    // section 2/4). Modelled on the same PATCH pattern Root's REST API uses
    // elsewhere in this file; unverified, no sandbox creds to confirm the exact
    // payload shape Root expects.
    cancel(policyId) {
        return rootApiFetch(this.transport, {
            method: 'PATCH',
            path: `/policies/${policyId}`,
            body: { status: 'cancelled' },
        });
    }
}
exports.RootHttpAdapter = RootHttpAdapter;
//# sourceMappingURL=rootAdapter.js.map