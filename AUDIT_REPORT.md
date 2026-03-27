# Driiva — Full System Audit Report

**Date:** 2026-03-08
**Auditor:** Claude Code (automated)
**Scope:** Security · Performance · Code Quality · Test Coverage · Infrastructure
**Branch:** `claude/pensive-zhukovsky`

---

## Executive Summary

| Dimension         | Rating     | Critical | High | Medium | Low |
|-------------------|------------|----------|------|--------|-----|
| Security          | ⚠️ Fair    | 1        | 6    | 5      | 4   |
| Performance       | ✅ Good    | 0        | 1    | 3      | 3   |
| Code Quality      | ✅ Good    | 0        | 2    | 4      | 4   |
| Test Coverage     | ⚠️ Fair    | 0        | 2    | 3      | 1   |
| Infrastructure    | ⚠️ Fair    | 0        | 1    | 3      | 2   |

**Overall health: B+ (production-eligible MVP with specific gaps to close before payments go live)**

**Top 3 priorities:**
1. Fix `express-rate-limit` IPv4-mapped IPv6 bypass — all auth rate limiters are currently bypassable
2. Wire Cloud Functions rate limiting — 8 callable functions have `TODO: rate limiting` comments
3. No production deployment pipeline — CI only auto-deploys to staging, not production

---

## 1. Security

### CRITICAL

#### C-1 · `basic-ftp` Path Traversal Vulnerability
**Severity:** CRITICAL | **Est. fix:** 30 min
**Detail:** `basic-ftp` has a path traversal vulnerability in `downloadToDir()`. Present as a transitive dependency.
**File:** `package.json` (transitive via firebase-tools)
**Action:** Run `npm audit fix`; if not auto-fixable, pin `firebase-tools` to a patched version. Verify `basic-ftp` is only in `devDependencies` scope (firebase-tools is dev-only), which limits blast radius to build/deploy machines.

---

### HIGH

#### H-1 · `express-rate-limit` IPv4-Mapped IPv6 Bypass
**Severity:** HIGH | **Est. fix:** 1 hour
**Detail:** All rate limiters (`authLimiter`, `apiLimiter`, `tripDataLimiter`, `webhookLimiter`) are bypassable by using IPv4-mapped IPv6 addresses (`::ffff:1.2.3.4`). Attackers can brute-force auth endpoints by cycling address format.
**File:** `server/middleware/security.ts:5-33`, `server/middleware/rateLimiter.ts`
**Action:** Upgrade `express-rate-limit` to ≥7.5.0 which patches this. Alternatively, add `keyGenerator: (req) => req.ip?.replace(/^::ffff:/, '') ?? 'unknown'` to all limiter configs as an interim fix.

#### H-2 · Cloud Functions Callable — Missing Rate Limiting (8 endpoints)
**Severity:** HIGH | **Est. fix:** 3 hours
**Detail:** Eight callable Cloud Functions have explicit `TODO: Rate limiting` comments and no enforcement. Affected functions: `initializePool`, `addPoolContribution`, `cancelTrip`, `classifyTrip`, `batchClassifyTrips`, `exportUserData`, `deleteUserAccount`, and the Perplexity AI coach. Without limits, authenticated users can:
- Hammer the AI analysis endpoint (Anthropic API cost abuse)
- Spam the GDPR delete endpoint
- Overload the Python Stop-Go-Classifier

**Files:**
- `functions/src/http/admin.ts:24,55,77`
- `functions/src/http/classifier.ts` (rate limiting TODOs)
- `functions/src/http/gdpr.ts` (rate limiting TODOs)

**Action:** Use Firebase App Check (recommended for callables) and/or add per-user counters in Firestore. At minimum, use Firebase's built-in concurrency limits via `maxInstances`.

#### H-3 · `rollup` Arbitrary File Write (Build-time)
**Severity:** HIGH (build-time only) | **Est. fix:** 30 min
**Detail:** `rollup` 4.x path traversal allows arbitrary file write during build. Exploitable if build inputs are untrusted (e.g. malicious `node_modules`).
**Action:** Run `npm audit fix` — Vite typically bundles a patched rollup. Pinning Vite to latest stable resolves this.

#### H-4 · `hono` Multiple Vulnerabilities (transitive)
**Severity:** HIGH | **Est. fix:** 30 min
**Detail:** `hono` (transitive dep) has: auth bypass via IP spoofing in AWS Lambda ALB, cookie attribute injection via unsanitized domain/path, SSE control field injection via CR/LF. Not directly used in the app stack (Express is primary), so blast radius is low but dependency should be updated.
**Action:** `npm audit fix`; monitor if any direct dep pulls hono into runtime paths.

#### H-5 · `fast-xml-parser` DoS via Entity Expansion
**Severity:** HIGH | **Est. fix:** 30 min
**Detail:** Malformed XML with DOCTYPE entity expansion can cause DoS. Used as transitive dep.
**Action:** `npm audit fix` to bump to a patched version.

#### H-6 · Username Enumeration via Public Firestore Read
**Severity:** HIGH | **Est. fix:** 2 hours
**Detail:** `firestore.rules:70` allows `allow read: if true` on `/usernames/{username}`. This means any unauthenticated client can check whether a username/email exists, enabling account enumeration before attacking passwords.
**Note:** The comment in the rules file already flags this: *"consider replacing public read with a Cloud Function to prevent username enumeration attacks."*
**File:** `firestore.rules:69-74`
**Action:** Replace client-side username lookup with a Cloud Function that returns only a boolean `exists` field without exposing the uid, and requires CAPTCHA or rate limiting.

---

### MEDIUM

#### M-1 · `userId: 0` Fallback in Auth Middleware
**Severity:** MEDIUM | **Est. fix:** 2 hours
**Detail:** In `server/middleware/auth.ts:63`, if a Firebase user authenticates but has no matching record in the Neon PostgreSQL DB, `userId` is set to `0` rather than causing an auth failure. Routes using `requireResourceOwner` compare against `req.auth!.userId` — a userId of `0` could match against other zero-id DB records or cause unexpected query behavior.
**File:** `server/middleware/auth.ts:63`
```typescript
userId: user?.id ?? 0,  // ← 0 is a valid integer; could cause subtle bugs
```
**Action:** If `user` is null, set `req.auth = undefined` and let `requireAuth` catch it, or return a 401 directly.

#### M-2 · CSP `unsafe-inline` in `style-src`
**Severity:** MEDIUM | **Est. fix:** 4 hours (Tailwind-dependent)
**Detail:** `server/middleware/security.ts:52` sets `style-src 'self' 'unsafe-inline' ...`. Required by Tailwind CSS (inline style injection) and Leaflet. Allows XSS via style injection if other CSP directives fail.
**File:** `server/middleware/security.ts:52`
**Action:** Investigate if Tailwind v4 (JIT) with a strict CSP nonce is feasible. Leaflet also injects inline styles — this may be unavoidable without patching. Document the accepted risk in a security decision log.

#### M-3 · CSP Missing `connect-src` for Perplexity/AI Coach
**Severity:** MEDIUM | **Est. fix:** 30 min
**Detail:** The CSP `connect-src` directive (`security.ts:50`) whitelists `api.anthropic.com` but not any Perplexity API endpoint. If the AI coach calls Perplexity from the client, those requests will be blocked by CSP in production. If server-proxied, no issue.
**File:** `server/middleware/security.ts:50`
**Action:** Confirm whether AI coach calls Perplexity from client or server. If server-proxied, no change needed. If client-side, add `https://api.perplexity.ai` to `connect-src`.

#### M-4 · `minimatch` ReDoS via Repeated Wildcards
**Severity:** MEDIUM | **Est. fix:** 30 min
**Detail:** `minimatch` has three separate ReDoS vulnerabilities via repeated wildcards. Used via `glob` and Firebase SDK. Could cause server hangs if user-controlled patterns reach minimatch (unlikely in this app but worth fixing).
**Action:** `npm audit fix`.

#### M-5 · Sentry DSN Hardcoded in CI Workflow
**Severity:** MEDIUM (low practical risk) | **Est. fix:** 30 min
**Detail:** `.github/workflows/ci.yml:105` has the staging Sentry DSN hardcoded. Client-side Sentry DSNs are inherently public (they appear in browser bundles), so this is low practical risk. However, having it in plaintext in a workflow file means anyone with repo read access can send fake events to the Sentry project.
**File:** `.github/workflows/ci.yml:105`
**Action:** Move to `${{ secrets.VITE_SENTRY_DSN_STAGING }}` for consistency and to reduce noise-attack surface.

---

### LOW

#### L-1 · Hardcoded Test Credentials in `signin-minimal.tsx`
**Severity:** LOW | **Est. fix:** 15 min
**Detail:** `client/src/pages/signin-minimal.tsx:8-9` pre-fills `driiva1`/`driiva1` as username/password defaults. If this page is reachable in production, it signals to users that test creds exist.
**File:** `client/src/pages/signin-minimal.tsx:8-9`
**Action:** Confirm this route is not registered in `App.tsx` for production builds, or gate it behind `import.meta.env.DEV`.

#### L-2 · First-User Auto-Admin Promotion
**Severity:** LOW | **Est. fix:** 30 min
**Detail:** `functions/src/triggers/users.ts` auto-promotes the first user to admin regardless of `ADMIN_EMAILS`. In a production environment, if the first signup is not the intended admin, they get permanent admin access.
**Action:** Remove the "first user" auto-promotion shortcut; rely solely on `ADMIN_EMAILS` for admin gating.

#### L-3 · leaderboard/communityPool Public Firestore Reads
**Severity:** LOW (by design) | **Est. fix:** 2 hours
**Detail:** `firestore.rules:186,204` allow unauthenticated reads of leaderboard and communityPool. These are intentional for public display, but could be scraped without auth. No personal data is exposed (aggregates only).
**File:** `firestore.rules:185-207`
**Action:** Acceptable for current stage. If PII is ever added to leaderboard entries (e.g. full names), restrict to `isAuthenticated()`.

#### L-4 · WebAuthn Scaffolded but Not Exposed
**Severity:** LOW | **Est. fix:** N/A
**Detail:** `server/webauthn.ts` and `client/src/pages/signin-minimal.tsx` scaffold WebAuthn/passkey flows, but the main login UI does not offer passkeys. No security risk (dead code), but the scaffolding could be misleading.
**Action:** Either complete the WebAuthn flow or remove the scaffolding to reduce attack surface and confusion.

---

## 2. Performance

### HIGH

#### H-7 · No Bundle Size Budget Enforcement
**Severity:** HIGH | **Est. fix:** 1 hour
**Detail:** `vite.config.ts` defines `manualChunks` for `firebase` and `vendor`, which is good. However there is no `chunkSizeWarningLimit` or Rollup `output.experimentalMinChunkSize` set. Firebase SDK alone is ~800 KB gzipped. Without a budget, bundle bloat can creep in undetected.
**File:** `vite.config.ts`
**Action:** Add `build.chunkSizeWarningLimit: 500` (KB) and configure Rollup to warn on chunks over 200 KB. Run `npx vite-bundle-visualizer` to get a baseline. Consider tree-shaking Firebase — import only used submodules (`firebase/auth`, `firebase/firestore`) rather than the full SDK.

---

### MEDIUM

#### M-6 · Leaflet Map Loaded on Every Dashboard Visit
**Severity:** MEDIUM | **Est. fix:** 2 hours
**Detail:** `client/src/pages/dashboard.tsx:12` lazy-loads `LeafletMap`, which is good. But the Leaflet CSS (via OpenStreetMap tiles) is always loaded because the dashboard page itself is eagerly imported. On mobile with slow connections, the map stalls LCP.
**Action:** Defer map rendering behind a user gesture or intersection observer. Consider a static tile placeholder until the user scrolls to the map.

#### M-7 · Firestore `tripPoints/batches` Rule Uses `get()` (Extra Read Cost)
**Severity:** MEDIUM | **Est. fix:** 1 hour
**Detail:** `firestore.rules:154-155` calls `get(/databases/$(database)/documents/tripPoints/$(tripId))` inside the batch subcollection rule. Every client read of a batch triggers an extra Firestore read for the parent document. On long trips with many batches, this multiplies read costs.
**File:** `firestore.rules:152-158`
**Action:** Denormalize the `userId` field into each batch document and check `resource.data.userId == request.auth.uid` directly, eliminating the `get()` call.

#### M-8 · No Service Worker / Offline Support
**Severity:** MEDIUM | **Est. fix:** 4 hours
**Detail:** No service worker is registered (FCM service worker exists for push notifications only). The app has no offline fallback, so any connectivity drop during a trip recording leaves the user with a blank screen.
**File:** ROADMAP.md ("Build service worker for offline/PWA support" — unchecked)
**Action:** Register a Workbox service worker with `NetworkFirst` for API routes and `CacheFirst` for static assets. Prioritise trip-recording.tsx as the most critical offline scenario.

---

### LOW

#### L-5 · No Lighthouse CI Integration
**Severity:** LOW | **Est. fix:** 2 hours
**Action:** Add `lhci` to CI pipeline to gate on mobile LCP < 2.5s and CLS < 0.1.

#### L-6 · `recharts` Not Tree-Shaken
**Severity:** LOW | **Est. fix:** 1 hour
**Detail:** `recharts` is ~500 KB minified. Importing component by component (`import { LineChart } from 'recharts'`) is correct, but Recharts v2 bundles all chart types regardless. Consider migrating score trend charts to a lighter library (e.g. `uplot` at ~6 KB).

#### L-7 · `@radix-ui` — 31 Packages, Many Possibly Unused
**Severity:** LOW | **Est. fix:** 2 hours
**Detail:** All 31 `@radix-ui/*` components are listed as direct dependencies. Components like `@radix-ui/react-menubar`, `@radix-ui/react-hover-card`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-context-menu` are unlikely to be used in a mobile-first insurance app.
**Action:** Audit active Radix usage with `grep -r "@radix-ui" client/src --include="*.tsx" | grep "from"` and remove unused packages.

---

## 3. Code Quality

### HIGH

#### H-8 · Phone Usage Score Hardcoded to 100 (No Penalty Ever)
**Severity:** HIGH | **Est. fix:** 4 hours (detection) or 1 hour (honest disclosure)
**Detail:** The scoring engine allocates 10% weight to phone usage, but the score is always 100 (no penalty). This means the "phone usage" metric is misleading — users are always rewarded full marks for a safety category that is not actually measured.
**Files:**
- `ROADMAP.md` — "Phone pickup detection" unchecked
- Multiple TODOs in `server/lib/telematics.ts`, `client/src/pages/trip-recording.tsx`
**Action (Option A):** Implement accelerometer-based phone pickup detection. **Action (Option B, interim):** Set phone score weight to 0% until detection is implemented; expose it as "coming soon" in the UI. Do not credit users for a safety metric that isn't being measured.

#### H-9 · `any` Types in Production Middleware
**Severity:** HIGH | **Est. fix:** 1 hour
**Detail:** `server/middleware/security.ts:77` uses `sanitizeObject(obj: any)` with nested `any` access. TypeScript strict mode is configured but `skipLibCheck: true` reduces enforcement coverage. The sanitizeInput function only strips `<>` characters — this is not sufficient XSS protection for rich text fields.
**File:** `server/middleware/security.ts:65-89`
**Action:** Type the sanitizer to `Record<string, unknown>` and add proper input validation (zod schemas at route handlers) rather than relying on global string mutation.

---

### MEDIUM

#### M-9 · `passport`, `passport-local`, `connect-pg-simple`, `express-session` Likely Unused
**Severity:** MEDIUM | **Est. fix:** 30 min
**Detail:** These packages are in `dependencies` (not devDependencies). The app uses Firebase Authentication as the sole auth mechanism. Passport session-based auth would conflict with Firebase JWT auth. These appear to be legacy/scaffolded deps that add ~200 KB to the server bundle and expand the attack surface.
**Action:** Verify with `grep -r "passport\|express-session\|connect-pg" server/` — if not imported, remove from `package.json`.

#### M-10 · `openid-client` Likely Unused
**Severity:** MEDIUM | **Est. fix:** 15 min
**Detail:** `openid-client` (~150 KB) is a full OpenID Connect client library. The app uses Firebase Auth for OAuth (Google SSO). No OpenID Connect flows are visible in the codebase.
**Action:** Remove if not actively used. Check `grep -r "openid-client" server/`.

#### M-11 · Admin Monitoring Dashboard — All Metrics Hardcoded to Zero
**Severity:** MEDIUM | **Est. fix:** 4 hours
**Detail:** `client/src/pages/admin/monitoring.tsx:56-59` hardcodes `avgLatencyMs: 0`, `functionsInvocations: 0`, `firestoreReads: 0`, `firestoreWrites: 0`. The admin monitoring page shows no real data, giving a false sense of observability.
**File:** `client/src/pages/admin/monitoring.tsx:56-59`
**Action:** Wire to Cloud Monitoring API or Firebase Performance. This is tracked in the "Observation Mode" sprint — prioritise it.

#### M-12 · 16 Open TODO Comments Including Security-Adjacent Items
**Severity:** MEDIUM | **Est. fix:** varies
**Detail:** 16 TODO/FIXME comments are scattered across the codebase. 8 are rate-limiting gaps on callable Cloud Functions (already captured as H-2). Notable others:
- `functions/src/http/gdpr.ts` — `TODO: Rate limiting – max 1 export per user per 24 hours`
- `functions/src/http/gdpr.ts` — `TODO: Rate limiting – consider requiring re-auth delay before delete`
- `client/src/pages/admin/monitoring.tsx` — all metrics stubbed
**Action:** Convert all TODOs to JIRA/GitHub tickets and track them in ROADMAP.md.

---

### LOW

#### L-8 · Dual Database Complexity Without Clear Ownership Boundary
**Severity:** LOW | **Est. fix:** N/A (architectural)
**Detail:** The app uses Firestore (primary) and Neon PostgreSQL (telematics/server-side). The PostgreSQL schema has trips/users tables mirrored from Firestore via `syncTripOnComplete` trigger. This creates two sources of truth and increases complexity. The PostgreSQL tables are noted as potentially stale in ROADMAP.
**Action:** Document which data is canonical in each DB and why. Consider whether Neon is worth the operational cost at MVP stage, or if Firestore can serve all use cases.

#### L-9 · WebAuthn Server Scaffolding in Main Dependency Bundle
**Severity:** LOW | **Est. fix:** 30 min
**Detail:** `@simplewebauthn/server` is in production dependencies but WebAuthn is not used in the live login flow. This adds ~50 KB to the server bundle unnecessarily.
**Action:** Move to feature branch or remove until WebAuthn login is shipped.

#### L-10 · `sanitizeInput` Only Strips `<>` — Not Comprehensive
**Severity:** LOW (defence-in-depth) | **Est. fix:** 2 hours
**Detail:** The global sanitizer only removes angle brackets. SQL injection protection relies on Drizzle ORM parameterization (good). NoSQL injection (Firestore) relies on Firestore's typed SDK (good). However, `javascript:` URLs in href fields, template literal injections in AI prompts, and path traversal in file names are not covered.
**Action:** Add zod validation schemas at each route handler level to enforce field types and lengths. Do not rely solely on the global sanitizer.

#### L-11 · Inconsistent Error Response Shape
**Severity:** LOW | **Est. fix:** 2 hours
**Detail:** Server routes return errors with mixed shapes: `{ message: "..." }`, `{ error: { message, code, timestamp } }`, and `{ message, code, authenticated }`. Clients must handle multiple formats.
**Action:** Standardise to a single error shape `{ error: { code: string, message: string } }` and update all route handlers.

---

## 4. Test Coverage

**Current state:** 247 tests passing across 16 test files. No coverage percentage captured (coverage tool not run in CI).

### HIGH

#### H-10 · No Tests for Server Routes (Express API)
**Severity:** HIGH | **Est. fix:** 8 hours
**Detail:** `server/routes.ts` (1,172 lines, 41+ endpoints) has zero test coverage. Auth flows, GDPR endpoints, payment webhooks, and pool modification routes are all untested at the integration level.
**Action:** Add supertest-based integration tests for at minimum: `POST /api/auth/login`, `GET /api/profile/me`, `DELETE /api/gdpr/delete/:userId`, `POST /api/webhooks/stripe`.

#### H-11 · No Tests for Stripe/Payment Flows
**Severity:** HIGH | **Est. fix:** 4 hours
**Detail:** Stripe webhook handler, subscription creation, and billing portal endpoints have no tests. Payment logic errors in production cannot be caught in CI.
**File:** `server/routes.ts:855-1100`
**Action:** Mock Stripe SDK and test: successful subscription creation, failed payment handling, webhook signature verification, and subscription cancellation.

---

### MEDIUM

#### M-13 · Cloud Function Rate Limiting Untested
**Severity:** MEDIUM | **Est. fix:** 2 hours
**Detail:** Once rate limiting is added to callable functions (H-2), ensure it is tested. No current tests verify that rate limits trigger correctly.

#### M-14 · Admin Routes Untested
**Severity:** MEDIUM | **Est. fix:** 2 hours
**Detail:** `PUT /api/community-pool` (admin-only pool modification) and all admin panel Cloud Functions have no tests. An admin logic bug could corrupt the shared pool.

#### M-15 · Trip Recording Component Untested
**Severity:** MEDIUM | **Est. fix:** 3 hours
**Detail:** `client/src/pages/trip-recording.tsx` — the most critical user flow — has no unit or integration tests. GPS state management, batch uploading, and status transitions are all untested.

---

### LOW

#### L-12 · Coverage Percentage Not Tracked in CI
**Severity:** LOW | **Est. fix:** 30 min
**Detail:** `npm run test:coverage` exists but is not run in the CI pipeline. No coverage badge or threshold enforcement.
**Action:** Add `npm run test:coverage` to CI and set a minimum threshold (e.g. `statements: 60`). Report coverage to Codecov or Coveralls for trend tracking.

---

## 5. Infrastructure

### HIGH

#### H-12 · No Production Deployment Pipeline
**Severity:** HIGH | **Est. fix:** 4 hours
**Detail:** `.github/workflows/ci.yml` auto-deploys to staging on every push to `main`. There is no production deploy job. Promoting from staging to production requires manual steps (undocumented).
**File:** `.github/workflows/ci.yml:90-159`
**Action:** Add a `deploy-production` job gated on a `workflow_dispatch` trigger or a git tag (`v*`). Require a manual approval step (GitHub Environment protection rules) before production deploy runs.

---

### MEDIUM

#### M-16 · Sentry Not Fully Wired in Cloud Functions
**Severity:** MEDIUM | **Est. fix:** 4 hours
**Detail:** ROADMAP notes 27 Cloud Functions need `wrapFunction`/`wrapTrigger` helpers from `functions/src/lib/sentry.ts`. Currently only some functions use Sentry. Unmonitored functions means errors are silent in production.
**File:** `functions/src/` — all trigger, scheduled, and HTTP function files
**Action:** Systematically wrap every function export with `wrapFunction` or `wrapTrigger`. Add to CI via a grep assertion that no function is exported without wrapping.

#### M-17 · `ENCRYPTION_KEY` Not Set in Production
**Severity:** MEDIUM | **Est. fix:** 1 hour
**Detail:** ROADMAP.md notes `ENCRYPTION_KEY` is required for telematics data at rest, and the server refuses to store data without it. This env var must be set via Firebase Secret Manager before any production data flows through the system.
**Action:** Verify it is set: `firebase functions:secrets:access ENCRYPTION_KEY --project production`. Add a startup assertion in server code that throws clearly if this variable is missing.

#### M-18 · No Staging/Production Environment Parity Documentation
**Severity:** MEDIUM | **Est. fix:** 2 hours
**Detail:** CI workflow hardcodes staging Firebase config in plaintext. Production env vars (DATABASE_URL, ANTHROPIC_API_KEY, ROOT_API_KEY) must be set in Vercel's environment variables dashboard — but there is no documented checklist of required vars or their expected format.
**Action:** Create `docs/DEPLOYMENT.md` listing every required env var, how to obtain it, and which systems need it set (Vercel, Firebase Secret Manager, GitHub Secrets). Mark each as required/optional.

---

### LOW

#### L-13 · No Dependabot / Automated Dependency Updates
**Severity:** LOW | **Est. fix:** 30 min
**Detail:** 24 npm vulnerabilities exist (1 critical, 7 high). No Dependabot configuration means these accumulate without automated PRs.
**Action:** Add `.github/dependabot.yml` with weekly npm updates and a max of 5 open PRs.

#### L-14 · Firebase Performance Monitoring Not Initialised
**Severity:** LOW | **Est. fix:** 2 hours
**Detail:** ROADMAP item "Add Firebase Performance Monitoring" is unchecked. Firebase Analytics is initialised but Performance SDK is not, meaning no Web Vitals data flows to Firebase Console.
**Action:** Add `getPerformance(app)` in `client/src/lib/firebase.ts` and add custom traces for the trip pipeline (trip start → first GPS point → upload → status change).

---

## Prioritised Action Plan

### Quick Wins (< 1 day each)

| # | Action | Severity | Est. |
|---|--------|----------|------|
| 1 | `npm audit fix` — auto-fix critical/high npm vulnerabilities | CRITICAL/HIGH | 30 min |
| 2 | Fix `express-rate-limit` IPv4 bypass — upgrade or add keyGenerator | HIGH | 1 hr |
| 3 | Remove `driiva1`/`driiva1` test credentials from signin-minimal.tsx | LOW | 15 min |
| 4 | Move Sentry DSN from CI workflow to GitHub Secret | MEDIUM | 30 min |
| 5 | Add `build.chunkSizeWarningLimit: 500` to vite.config.ts | HIGH | 30 min |
| 6 | Add `.github/dependabot.yml` for weekly npm updates | LOW | 30 min |
| 7 | Remove first-user auto-admin shortcut in users trigger | LOW | 30 min |
| 8 | Add `npm run test:coverage` to CI pipeline | LOW | 30 min |

### Medium-Term (1–5 days each)

| # | Action | Severity | Est. |
|---|--------|----------|------|
| 9 | Add rate limiting to 8 callable Cloud Functions (H-2) | HIGH | 3 hrs |
| 10 | Replace username public read with Cloud Function (H-6) | HIGH | 2 hrs |
| 11 | Fix `userId: 0` fallback in auth middleware (M-1) | MEDIUM | 2 hrs |
| 12 | Add supertest integration tests for Express routes (H-10) | HIGH | 8 hrs |
| 13 | Add Stripe webhook and payment flow tests (H-11) | HIGH | 4 hrs |
| 14 | Wire all Cloud Functions with Sentry wrappers (M-16) | MEDIUM | 4 hrs |
| 15 | Remove unused deps: passport, openid-client, connect-pg-simple (M-9/M-10) | MEDIUM | 30 min |
| 16 | Create `docs/DEPLOYMENT.md` env var checklist (M-18) | MEDIUM | 2 hrs |
| 17 | Eliminate `get()` from Firestore batch rules (M-7) | MEDIUM | 1 hr |
| 18 | Standardise server error response shape (L-11) | LOW | 2 hrs |

### Long-Term (> 5 days)

| # | Action | Severity | Est. |
|---|--------|----------|------|
| 19 | Phone usage detection (accelerometer pattern recognition) (H-8) | HIGH | 2+ sprints |
| 20 | Add production deployment pipeline with manual approval gate (H-12) | HIGH | 4 hrs |
| 21 | Service worker / offline PWA support (M-8) | MEDIUM | 4 hrs |
| 22 | WebAuthn login flow — complete or remove (L-4/L-9) | LOW | 1 sprint |
| 23 | Migrate score charts to lightweight lib to replace recharts (L-6) | LOW | 2 hrs |
| 24 | Lighthouse CI integration with performance budgets (L-5) | LOW | 2 hrs |
| 25 | Firebase Performance Monitoring + custom trip traces (L-14) | LOW | 2 hrs |

---

## Appendix: Test Coverage by Module

| Module | Tests | Coverage estimate |
|--------|-------|-------------------|
| `shared/tripProcessor.ts` | `trip-metrics.test.ts` (27 tests) | ~90% |
| `functions/src/utils/helpers.ts` (scoring) | `scoring.test.ts` (35 tests) | ~85% |
| `functions/src/triggers/trips.ts` | `triggers/trips.test.ts` (26 tests) | ~60% |
| `functions/src/triggers/policies.ts` | `triggers/policies.test.ts` (22 tests) | ~70% |
| `functions/src/scheduled/leaderboard.ts` | `scheduled/leaderboard.test.ts` (12 tests) | ~80% |
| `functions/src/scheduled/pool.ts` | `scheduled/pool.test.ts` (18 tests) | ~70% |
| `client/src/components/ProtectedRoute.tsx` | `auth-flow.test.tsx` (13 tests) | ~95% |
| `client/src/lib/insurance.ts` | `insurance.test.ts` (15 tests) | ~75% |
| `client/src/lib/useFeatureFlags.ts` | `feature-flags.test.ts` (4 tests) | ~90% |
| `client/src/components/FeedbackModal.tsx` | `feedback.test.tsx` (9 tests) | ~80% |
| `client/src/pages/privacy.tsx`, `terms.tsx` | `legal-pages.test.tsx` (14 tests) | ~60% |
| `functions/src/triggers/users.ts` | `damoovRegistration.test.ts` (6 tests) | ~50% |
| `server/routes.ts` | ❌ None | ~0% |
| `client/src/pages/trip-recording.tsx` | ❌ None | ~0% |
| `server/middleware/auth.ts` | ❌ None | ~0% |
| Payment/Stripe flows | ❌ None | ~0% |
| Admin routes | ❌ None | ~0% |

**Estimated overall statement coverage: ~45%** (unit-tested business logic high, integration layer low)

---

## Appendix: npm Vulnerability Summary

| Severity | Count | Key packages |
|----------|-------|-------------|
| CRITICAL | 1 | basic-ftp (path traversal) |
| HIGH | 7 | express-rate-limit, rollup, hono, fast-xml-parser, minimatch, @hono/node-server, tar |
| MODERATE | 5 | esbuild, drizzle-kit, @esbuild-kit/core-utils, vite |
| LOW | 11 | firebase-admin, google-gax, qs, retry-request, @tootallnate/once, et al. |

Run `npm audit fix` to auto-resolve the majority. Review breaking changes for `--force` fixes.

---

*Generated by Claude Code automated audit · 2026-03-08*
