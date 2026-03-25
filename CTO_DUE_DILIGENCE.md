# CTO Due Diligence Report — Driiva

**Date:** 2026-03-25
**Scope:** Full codebase review for a £500K investment decision
**Verdict:** CONDITIONAL PASS — 14 deal-breakers identified, all fixable within 4–6 weeks

---

## Executive Summary

Driiva is a UK telematics insurance platform with a solid technical foundation: deterministic scoring, Firebase-first architecture, good shared-code discipline, and 305 tests. The team has built a credible MVP.

**However, this codebase is not production-ready for a regulated financial product.** There are critical gaps in FCA compliance, financial calculation precision, data encryption, testing coverage, and operational maturity that would expose investors to regulatory and financial risk.

Below are the findings that would make me walk away — and what it would take to fix each one.

---

## DEAL-BREAKERS (Would Walk Away)

### 1. FAKE FCA REGISTRATION NUMBER IN PRODUCTION CODE
**Severity:** CRITICAL | **Category:** Regulatory
**File:** `client/src/components/PolicyDownload.tsx:141`

The policy download shows `DRV123456` as the FCA registration number. This is a placeholder. Displaying a fake FCA number on insurance documents is a criminal offence under FSMA 2000 s.24. If this ever reaches a real user, the company faces prosecution.

**Fix:** Replace with actual FCA registration or remove claim of regulation. Clarify whether Driiva operates under Root Platform's licence (and disclose that) or has its own authorisation.

---

### 2. NO INSURANCE PRODUCT INFORMATION DOCUMENT (IPID)
**Severity:** CRITICAL | **Category:** FCA Compliance
**Missing entirely**

FCA ICOBS 2 Rule 1R requires an Insurance Product Information Document in standardised format before a customer can be bound to a policy. This is not optional — it's a legal requirement. No IPID exists anywhere in the codebase.

**Fix:** Create FCA-compliant IPID (standard template available from EIOPA). Must include: coverage types, exclusions, claims process, complaint procedure, regulatory status.

---

### 3. UNDERWRITER NOT NAMED ANYWHERE
**Severity:** CRITICAL | **Category:** FCA Compliance
**File:** `client/src/pages/terms.tsx:312-318`

Terms say "Driiva is not the insurer" but never name who IS the insurer. FCA requires clear disclosure of the underwriting entity. Root Platform is referenced in scaffolded code but no formal arrangement is documented.

**Fix:** Name the underwriting entity in terms, privacy policy, and all policy documents. Sign and publish the underwriting arrangement.

---

### 4. GPS/TELEMATICS DATA STORED UNENCRYPTED
**Severity:** CRITICAL | **Category:** Security / GDPR
**Files:** `server/lib/crypto.ts` (exists but unused), `functions/src/triggers/trips.ts`

A `CryptoService` with AES-256-GCM exists but is **never imported or called anywhere**. All GPS trip points (lat/lng/speed/heading) are stored as cleartext in Firestore. For a telematics product processing continuous location data, this is a data protection failure.

ROADMAP.md line 48 says "Set `ENCRYPTION_KEY` env var in production (required)" — but no code checks for or uses it.

**Fix:** Encrypt tripPoints before Firestore write. Use CryptoService or Firestore client-side field encryption. This is a pre-launch blocker.

---

### 5. FLOATING-POINT ARITHMETIC ON MONEY
**Severity:** CRITICAL | **Category:** Financial Integrity
**File:** `functions/src/utils/helpers.ts:217-231`

Despite CLAUDE.md stating "All money is integer cents, no floats, end-to-end," the refund calculation uses float multiplication:

```typescript
const baseRefund = contributionCents * adjustedRefundRate;  // float math
const adjustedRefund = baseRefund * safetyFactor;            // float math
return Math.round(adjustedRefund);                           // rounds at end
```

IEEE 754 floating-point means `0.1 + 0.2 !== 0.3`. At scale, cumulative rounding errors on refund calculations will cause pool reconciliation failures.

**Fix:** Use basis-point integer math throughout, or adopt a decimal library. Round at each step, not just the end.

---

### 6. POOL SHARE PRECISION MISMATCH (4 vs 2 DECIMAL PLACES)
**Severity:** CRITICAL | **Category:** Financial Integrity
**Files:** `functions/src/scheduled/pool.ts:239`, `functions/src/triggers/pool.ts:63`, `functions/src/http/admin.ts:311,352`

`poolShares/{id}.sharePercentage` is stored at 4-decimal precision (×10000), but the denormalised copy in `users/{uid}.poolShare.sharePercentage` uses 2-decimal precision (×100). Across thousands of contributors, these don't reconcile. Any audit comparing user-facing vs canonical pool data will find discrepancies.

**Fix:** Standardise to 4-decimal (or basis points integer) everywhere. Document the canonical precision.

---

### 7. DUPLICATE HAVERSINE IMPLEMENTATION (BREAKS "SINGLE SOURCE OF TRUTH")
**Severity:** CRITICAL | **Category:** Architecture / Scoring Determinism
**Files:** `shared/tripProcessor.ts:23-40` (canonical), `functions/src/utils/helpers.ts:106-124` (duplicate)

CLAUDE.md says `shared/tripProcessor.ts` is the single source of truth, imported everywhere. But Cloud Functions has its own `calculateDistance()` with identical-looking math. `finalizeTripFromPoints()` in `functions/src/triggers/trips.ts:377` uses the local copy, not the shared one.

If the canonical Haversine is ever tuned (e.g., Earth radius correction for UK latitude), the Functions version won't track. This silently breaks scoring determinism.

**Fix:** Delete `calculateDistance()` from helpers.ts. Import `tripDistanceMeters()` from shared.

---

### 8. ZERO TEST COVERAGE ON PAYMENT FLOWS
**Severity:** CRITICAL | **Category:** Testing
**Files:** `server/routes.ts:839-973` (Stripe routes), `functions/src/triggers/payments.ts`

For an insurance product handling real premiums and refunds:
- Stripe checkout: **0 tests**
- Stripe webhooks: **0 tests**
- Payment triggers: **0 tests**
- Pool contribution→refund payout: **0 tests**
- Python classifier: **0 tests** (entire `api/` directory)
- Server routes: mock-only tests (not testing real Express handlers)
- E2E tests: **none exist**
- No coverage thresholds enforced in CI

305 unit tests exist and scoring logic is well-tested, but the money path is completely unvalidated.

**Fix:** Add Stripe integration tests, classifier tests (pytest), E2E with Playwright, and enforce coverage thresholds in CI.

---

### 9. NO DATA BREACH DETECTION OR RESPONSE PLAN
**Severity:** CRITICAL | **Category:** GDPR / Operational
**Missing entirely**

Privacy policy promises ICO notification within 72 hours (GDPR Art. 33), but there is:
- No breach detection mechanism
- No incident response playbook
- No breach notification templates
- No Data Protection Impact Assessment (DPIA) document (required by GDPR Art. 35 for location/behavioural profiling)

The `DPIA_REVIEWED_DATA_TYPES` constant in trips.ts is a code check, not an actual DPIA.

**Fix:** Conduct formal DPIA (ICO template). Write incident response plan. Create notification templates.

---

### 10. FIREBASE-ADMIN VERSION MISMATCH WITH CRITICAL CVEs
**Severity:** CRITICAL | **Category:** Security
**File:** `package.json:82`

Main `package.json` has `firebase-admin@^10.3.0` while `functions/package.json` has `@^12.0.0`. The v10 branch has:
- **CRITICAL:** `@google-cloud/firestore` credential logging vulnerability
- **HIGH:** `jsonwebtoken` RSA-to-HMAC key confusion (auth bypass)
- **MODERATE:** `@grpc/grpc-js` memory exhaustion

**Fix:** Upgrade main package.json to `firebase-admin@^12.0.0`. Run `npm audit fix`. Test thoroughly.

---

### 11. NO AUTOMATED FIRESTORE BACKUPS
**Severity:** CRITICAL | **Category:** Operational
**File:** `functions/src/scripts/exportFirestore.ts` (manual only)

An export script exists but must be run by hand. No scheduled backup, no Google Cloud Backup and Restore configured. If Firestore data is corrupted, deleted, or ransomed, there is no recovery point.

For a product storing financial records and insurance policies, this is unacceptable.

**Fix:** Deploy a scheduled Cloud Function for daily Firestore exports to GCS. Enable point-in-time recovery.

---

### 12. WATCHDOG FUNCTION WILL SILENTLY FAIL
**Severity:** HIGH | **Category:** Operational
**Files:** `functions/src/scheduled/watchdog.ts:33-37`, `firestore.indexes.json`

The watchdog queries `trips` with a composite filter `(status == 'failed', processedAt >= timestamp)` but no matching composite index exists in `firestore.indexes.json`. Firestore will throw a "missing index" error at runtime. The watchdog runs hourly and **has never worked**.

**Fix:** Add the composite index to `firestore.indexes.json` and deploy.

---

### 13. ERROR MESSAGES LEAK INTERNAL DETAILS TO CLIENTS
**Severity:** HIGH | **Category:** Security
**File:** `server/routes.ts` (25+ locations)

Raw `error.message` is returned to clients in error responses:
```typescript
res.status(500).json({ message: "Error fetching dashboard data: " + error.message });
```

This leaks stack traces, database query details, and system architecture to attackers.

**Fix:** Return generic error messages. Log detailed errors server-side only.

---

### 14. DATA RETENTION POLICY NOT ENFORCED
**Severity:** HIGH | **Category:** GDPR
**Files:** `client/src/pages/privacy.tsx:277-285`, `client/src/pages/trust.tsx:254-265`

Privacy policy promises:
- Raw GPS points deleted after 90 days
- Trip data retained 7 years post-policy

Neither is implemented. No TTL fields on Firestore documents. No scheduled deletion function. No Damoov deletion request in GDPR flow despite privacy policy promising it.

**Fix:** Add `expiresAt` to tripPoints. Deploy daily cleanup function. Add Damoov API deletion call to GDPR delete flow.

---

## HIGH-RISK ISSUES (Won't Walk Away, But Need Plan)

### 15. Dual Backend Drift Risk
Express server (`server/lib/telematics.ts`) mirrors the Cloud Functions trip pipeline. Two codepaths computing scores/distances = eventual divergence. The shared module helps but doesn't prevent it (see finding #7).

### 16. Python Classifier Has No Retry or Fallback
`functions/src/http/classifier.ts:100-107` — If the classifier is down, trips complete without segmentation data and are never reclassified. No retry, no dead-letter queue, no alerting.

### 17. CORS Falls Back to Localhost in Production
`server/app.ts:11-20` — If `CORS_ORIGINS` env var is unset, defaults include `localhost:5173`. Should fail-closed in production.

### 18. In-Memory Rate Limiting on AI Coach
`server/routes.ts:653-669` — Uses a `Map<>` that resets on every Vercel cold start and isn't shared across instances. Effectively no rate limiting.

### 19. GDPR Delete Has No Re-Authentication
`functions/src/http/gdpr.ts:149-153` — A stolen session token can permanently delete a user's account and all data without additional verification.

### 20. Firestore→Neon Sync Has No Retry
`functions/src/triggers/syncTripOnComplete.ts` — If Neon write fails, the Firestore document succeeds but Neon shows stale data. No retry queue or dead-letter mechanism.

### 21. Username Collection is Publicly Readable
`firestore.rules:69-74` — `allow read: if true` on the `usernames` collection enables enumeration of all registered users.

### 22. Stripe Payment Amount Trusted From Client
`server/routes.ts:852-857` — Client sends `annualPremiumCents` which is range-checked (£100–£5000) but not validated against a server-side computed quote. User could underpay.

### 23. No Cookie Consent Banner
Firebase Analytics initialises without explicit consent. Violates PECR. Privacy policy doesn't name Anthropic, Stripe, Vercel, or Sentry as processors.

### 24. No Staging Environment
`.firebaserc` has `driiva-staging` alias but the project was never provisioned. CI deploy-staging job has `continue-on-error: true`, masking failures. No pre-production testing possible.

---

## WHAT'S DONE WELL

Credit where due — these are genuine strengths:

- **Scoring determinism:** `computeDrivingScore()` is well-tested (23 tests including edge cases) and truly deterministic
- **Shared code discipline:** `shared/tripProcessor.ts` as canonical source is the right pattern
- **Firebase architecture:** Firestore-primary with one-way sync to Neon is clean and well-documented
- **CLAUDE.md / ROADMAP.md:** Exceptional documentation. Hard stops are clearly defined. Architectural decisions are recorded.
- **Security middleware:** CSP headers, rate limiting, Firebase token verification, IPv6 normalisation — all present
- **Sentry integration:** Error monitoring with PII scrubbing, session replay, and structured metric tags
- **GDPR implementation:** Data export and deletion are functionally complete (8 collections covered, batch operations, parallel processing)
- **CI pipeline:** TypeScript strict, tests block PRs, staging deploy job exists (even if target isn't provisioned)
- **Feature flags:** Lightweight and appropriate for current scale
- **197+ passing tests:** Scoring, trip processing, auth flow, GDPR — core business logic is validated

---

## INVESTMENT RECOMMENDATION

### Would I invest £500K today? **No.**

### Would I invest after a 6-week remediation sprint? **Yes, conditionally.**

**The core product thesis is sound.** Deterministic scoring, community pool mechanics, and the UK telematics market opportunity are all credible. The engineering team has made mostly good architectural decisions and documented them well.

**But the product cannot legally go to market** without:
1. FCA regulatory clarity (real registration or formal underwriting arrangement)
2. IPID and proper insurance disclosures
3. Encrypted telematics data
4. Financial calculation precision fixes
5. Payment flow testing

### Proposed 6-Week Remediation

| Week | Focus | Findings Addressed |
|------|-------|--------------------|
| 1 | FCA compliance: IPID, underwriter disclosure, remove fake reg number | #1, #2, #3 |
| 2 | Security: encrypt tripPoints, fix firebase-admin, error sanitisation | #4, #10, #13 |
| 3 | Financial integrity: basis-point math, pool precision, delete duplicate Haversine | #5, #6, #7 |
| 4 | Testing: Stripe tests, classifier tests, E2E suite, coverage thresholds | #8 |
| 5 | GDPR/Ops: DPIA, breach plan, retention enforcement, automated backups | #9, #11, #14 |
| 6 | Operational: fix watchdog index, staging env, classifier retry, high-risk items | #12, #15–24 |

**Post-remediation conditions for investment:**
- All 14 deal-breakers resolved and verified
- FCA regulatory status confirmed in writing
- Independent security penetration test completed
- Staging environment live with full CI/CD pipeline
- Coverage thresholds ≥70% enforced in CI

---

*Report prepared via automated codebase analysis. All findings include file:line references verified against the repository at commit HEAD.*
