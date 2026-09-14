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

import * as functions from 'firebase-functions/v1';

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
export function resolveCurrency(amountMinorUnits: number): number {
  // Identity pass-through, deliberately. See the comment above and
  // ROADMAP.md TD-4 - do not guess a conversion rate here.
  return amountMinorUnits;
}

// ============================================================================
// ROOT ADAPTER TYPES (mirrors the shapes insurance.ts already used)
// ============================================================================

export interface RootQuoteRequest {
  type: string;
  policyholder_id?: string;
  module: Record<string, unknown>;
}

export interface RootQuoteResponse {
  quote_package_id: string;
  created_at: string;
  module: { type: string; [key: string]: unknown };
  suggested_premium: number;
  billing_amount: number;
  expiry_date: string;
}

export interface RootPolicyholderResponse {
  policyholder_id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
}

export interface RootApplicationRequest {
  quote_package_id: string;
  policyholder_id: string;
}

export interface RootApplicationResponse {
  application_id: string;
  policy_id: string | null;
  status: string;
  created_at: string;
  monthly_premium: number;
  policy_number: string | null;
}

export interface RootPolicyResponse {
  policy_id: string;
  policy_number: string;
  status: string;
  created_at: string;
  monthly_premium: number;
  sum_assured: number;
  start_date: string;
  end_date: string;
  module: Record<string, unknown>;
}

export interface RootCancelResponse {
  policy_id: string;
  status: string;
  cancelled_at: string;
}

/**
 * Typed seam over the Root Platform operations this codebase already models:
 * quote (getInsuranceQuote's `/quotes` call), bind (acceptInsuranceQuote's
 * ensure-policyholder + `/applications` + fetch-policy sequence), sync
 * (syncInsurancePolicy's `/policies/:id` GET), and cancel (new - no prior
 * cancellation primitive existed, see file header).
 */
export interface RootAdapter {
  quote(request: RootQuoteRequest): Promise<RootQuoteResponse>;
  ensurePolicyholder(input: {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
  }): Promise<RootPolicyholderResponse>;
  bind(request: RootApplicationRequest): Promise<RootApplicationResponse>;
  getPolicy(policyId: string): Promise<RootPolicyResponse>;
  sync(policyId: string): Promise<RootPolicyResponse>;
  cancel(policyId: string): Promise<RootCancelResponse>;
}

// ============================================================================
// CONFIG (unchanged from insurance.ts's getRootConfig)
// ============================================================================

interface RootConfig {
  apiKey: string;
  apiUrl: string;
  environment: 'sandbox' | 'production';
  productModuleKey: string;
}

export function getRootConfig(): RootConfig {
  const apiKey = process.env.ROOT_API_KEY;
  const productModuleKey = process.env.ROOT_PRODUCT_MODULE_KEY;

  if (!apiKey) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Root Platform API key is not configured. Set ROOT_API_KEY in functions environment.',
    );
  }

  if (!productModuleKey) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Root product module key is not configured. Set ROOT_PRODUCT_MODULE_KEY in functions environment.',
    );
  }

  return {
    apiKey,
    apiUrl: process.env.ROOT_API_URL || 'https://api.rootplatform.com/v1/insurance',
    environment: (process.env.ROOT_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
    productModuleKey,
  };
}

interface RootApiOptions {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: Record<string, unknown>;
}

/**
 * Transport used by RootHttpAdapter. Exposed so tests can inject a mocked
 * fetch instead of hitting the real (uncredentialed) Root sandbox.
 */
export type RootTransport = typeof fetch;

async function rootApiFetch<T>(
  transport: RootTransport,
  options: RootApiOptions,
): Promise<T> {
  const config = getRootConfig();
  const url = `${config.apiUrl}${options.path}`;

  const headers: Record<string, string> = {
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
    throw new functions.https.HttpsError(
      'internal',
      `Root Platform API error (${response.status}): ${errorBody}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * The sole concrete implementation of RootAdapter. Behaviour (paths, method
 * verbs, request bodies) is unchanged from insurance.ts's pre-seam inline
 * calls - this is a structural extraction, not a fix. `cancel` is the one
 * genuinely new method (see file header) and is exactly as unverified as the
 * rest.
 */
export class RootHttpAdapter implements RootAdapter {
  constructor(private readonly transport: RootTransport = fetch) {}

  quote(request: RootQuoteRequest): Promise<RootQuoteResponse> {
    return rootApiFetch<RootQuoteResponse>(this.transport, {
      method: 'POST',
      path: '/quotes',
      body: request as unknown as Record<string, unknown>,
    });
  }

  ensurePolicyholder(input: {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
  }): Promise<RootPolicyholderResponse> {
    return rootApiFetch<RootPolicyholderResponse>(this.transport, {
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

  bind(request: RootApplicationRequest): Promise<RootApplicationResponse> {
    return rootApiFetch<RootApplicationResponse>(this.transport, {
      method: 'POST',
      path: '/applications',
      body: request as unknown as Record<string, unknown>,
    });
  }

  getPolicy(policyId: string): Promise<RootPolicyResponse> {
    return rootApiFetch<RootPolicyResponse>(this.transport, {
      method: 'GET',
      path: `/policies/${policyId}`,
    });
  }

  sync(policyId: string): Promise<RootPolicyResponse> {
    return this.getPolicy(policyId);
  }

  // NEW - no prior cancellation primitive existed in this codebase (grounding
  // section 2/4). Modelled on the same PATCH pattern Root's REST API uses
  // elsewhere in this file; unverified, no sandbox creds to confirm the exact
  // payload shape Root expects.
  cancel(policyId: string): Promise<RootCancelResponse> {
    return rootApiFetch<RootCancelResponse>(this.transport, {
      method: 'PATCH',
      path: `/policies/${policyId}`,
      body: { status: 'cancelled' },
    });
  }
}
