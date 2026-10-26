# Driiva Ground-Up Rebuild — Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This is the master plan: each module (M0–M8) gets its own bite-sized TDD plan via superpowers:writing-plans at execution time, seeded from its section here.** Phase 2 is GATED on Jamal's sign-off of this document + the characterisation suite + findings.md §0.3 gaps.

**Goal:** Rebuild Driiva (web + API + functions, then mobile) module-by-module behind the characterisation suite, so every behaviour is either consciously kept (test stays green) or consciously dropped (test deleted with a logged decision) — never silently lost.

**Architecture:** Strangler pattern over the existing repo: a contracts-first monorepo core grows module by module on `rebuild/*` branches while the current app keeps running untouched on main. One authoritative store per entity, one scoring implementation, one typed contract package — the three diseases the audit found (split-brains, four scoring engines, three hand-mirrored type files) are structurally impossible in the target.

**Tech Stack:** TypeScript strict everywhere; pnpm workspaces; zod contracts; React 18 + Vite (web); Express 5 + zod + OpenAPI (API); Firebase Auth/Firestore/Functions (data+events); Stripe; Expo SDK 54 + EAS (mobile, later); Playwright + vitest + Maestro + @firebase/rules-unit-testing (tests).

## Global Constraints

- main is production posture — never commit there; all work on `rebuild/*` branches; user merges.
- The characterisation suite (server contract 43, rate-limit 1, pricing 18, tripService 12, E2E 25×2, Maestro 6) is the safety net: each module's slice must pass against the NEW code, except quirks explicitly dropped via that module's Quirk Disposition Table (decision logged in the module PR).
- Compliance copy rules from CONTEXT.md are product constraints: "up to 15% cashback" cap, ERG conditional, no FCA-approval claims (findings §0.5 #6 must die), no phone-use scoring marketed while neutral, proprietary-not-open-source framing.
- UK spelling, no em dashes in user-facing copy, Instrument-mode design tokens from design-system/ for app surfaces.
- Every interactive element gets a `data-testid` (audit: zero exist today).
- Money is integer pence end-to-end with a typed `Money` value object; a displayed figure must be derived from the charged figure by one shared function (kills findings §0.5 #5).
- Deterministic scoring: same inputs → same score, property-tested; server-side authority only.
- No new secrets outside Doppler.
- **Deploy isolation (harness finding H2):** rebuild functions/rules/indexes deploy ONLY to the emulator and `driiva-staging` until the named cutover task of the relevant module; the ONLY permitted prod Firebase deploy before cutover is the D13 rules hotfix. `.firebaserc` defaults `firebase deploy` to prod — every deploy command in module plans must carry an explicit `--project staging` (or run inside the emulator) until cutover.

## DECISION POINTS — sign-off needed before Phase 2 (defaults proposed; silence = default)

> **Parked, 26 October 2026.** Driiva is paused, so this sign-off is parked: silence does NOT mean default while the pause stands, and no Phase 2 module starts. See the note at the top of `ROADMAP.md`.

| # | Decision | Default (one-line justification) | Alternative |
|---|---|---|---|
| D1 | Operational data store | **Firestore-only for operational entities** — it is already the authoritative store for every live entity; the Postgres mirrors are dead or read-models (audit-data §5), and the web app's realtime UX is onSnapshot-shaped | Postgres-only (bigger migration, loses realtime, replaces rules model) |
| D2 | Postgres/Neon fate | **Retain only as an analytics/reporting read-model fed by one projection worker** (trips_summary pattern, made reliable) | Drop entirely |
| D3 | API stack | **Express 5 + zod-validated routes + generated OpenAPI + openapi-fetch typed client** — smallest strangler delta, satisfies the roadmap's OpenAPI ticket, kills `Promise<any>` | Hono or tRPC (bigger swing, tRPC couples mobile) |
| D4 | Web router/data | **TanStack Router + TanStack Query wrapping Firestore listeners** — typed routes and one data layer replace wouter strings + ad-hoc onSnapshot | Keep wouter (smaller delta, keeps stringly routes) |
| D5 | Launch surface | **Web first, mobile M7** (June Gate 0 decision) — confirm it still stands | Mobile-first (contradicts Gate 0) |
| D6 | Pool money handling | **NEEDS YOUR DEFINITION** (findings §0.3 gap 9): ledger model, client-money/CASS posture, refund authority. M3 is blocked on this — no default proposed for an FCA-adjacent money structure | — |
| D7 | Postcode pricing model | **Replace single-letter fallback with a real outward-code table** — current engine charges Bath as Birmingham (+20%), directly contradicting the postcode-penalty-reduction proposition | Keep current behaviour (pinned in tests) |
| D8 | GDPR erasure scope | **Erasure propagates to all stores + Stripe/Root/Damoov** (audit: today it touches Firestore only) — confirm legal posture | Firestore+Auth only (current behaviour) |
| D9 | Coverage bar | **Flow-level: every findings-§1c flow has ≥1 E2E + every module ≥80% line coverage on its core package** (TECH_ROADMAP's "80% fintech standard" adopted per-package, not repo-wide) | Repo-wide 80% (punishes glue code) |
| D10 | Mobile telematics | **Damoov SDK properly integrated in M7** (server side already built) | First-party GPS capture (web trip-recording pattern) |
| D11 | Claims / "GAP claim integrations" | **NEEDS YOUR DEFINITION** (findings §0.3 gap 3): no claims flow, no GAP code exists to characterise. M8 blocked | — |
| D12 | `/production-bug-hunter` | **Substitute = code-reviewer skill + logic-gap-harness sweep per module** — the named skill doesn't exist on this machine | Name a different gate |
| D13 | firestore.rules merge conflict on main | **Hotfix main now** (3-line fix + `firebase deploy --only firestore:rules` after diffing deployed rules) — it's a live-prod unknowability, shouldn't wait for the rebuild | Fix only on rebuild branch |
| D14 | Sharia-compliance requirements (§0.3 gap 10) | **NEEDS YOUR DEFINITION** — core proposition with zero documented product requirements; no module can own it until defined | — |
| D15 | FCA operating model (§0.3 gap 5) | **NEEDS CONFIRMATION IN WRITING from Root** — "under Root's licence" is an assumption; M4's policy lifecycle and what the app may display depend on it | — |
| D16 | Device/browser support matrix (§0.3 gap 4) | **Propose: last-2 evergreen Chrome/Safari/Firefox + iOS 16+/Android 10+** — confirm or replace; becomes the Playwright/EAS test matrix in M0 CI | — |

## Migration & cutover workstream (harness finding H1 — runs THROUGH every module, not a module of its own)

The plan rebuilds writers; this workstream moves the existing production corpus. Per module, the module plan MUST include:
1. **Corpus sampling task (starts in M0):** export a sample of live prod docs per entity and run them through the module's zod schemas BEFORE the module builds on them — the dossier pinned shapes from code, and its own follow-ups admit unaudited variants (mobile-vs-web signup docs, two policy shapes by bind path, `onboardingCompleted` legacy fields).
2. **Versioned-read or backfill decision per entity:** either the new reader tolerates old shapes behind a version discriminator, or an Admin-SDK backfill rewrites them (Admin SDK bypasses rules, so immutable-by-rule collections like tripPoints are migratable — but it must be a PLANNED task, incl. a rules relaxation window if a client-visible shape changes).
3. **Cutover task per module:** a named, sign-off-gated step that flips real traffic from old path to new (feature flag or route switch), with the rollback being the flag flip back. No module is "done" while its cutover task is unexecuted or its rollback untested on staging.
4. **Parallel-run proof where money/score is involved (M2, M3, M4):** run old and new pipelines side by side on staging for a defined window and diff outputs before cutover.
5. **Live-store continuity check:** `webauthn_credentials`/`webauthn_challenges` currently live in Postgres and are LIVE (passkey users exist) — D1/D2's "Postgres becomes analytics-only" default must NOT strand them; M1 owns their fate explicitly (keep the Postgres store, or migrate credentials with their counters intact).

## Launch gate (owns what no single module owns)

Module completion ≠ launch. The launch gate = TECH_ROADMAP's public-beta bar (findings §0.2): pen test, code security audit, load test (1,000+ concurrent), ICO registration, FCA/Root licence confirmation (D15), staging environment complete, incident-response procedures, the §1c manual-verify list executed and signed, and the §0.3 gaps each resolved by a decision (not by silence). This gate is a checklist reviewed with Jamal after M5 — it cannot be satisfied by any suite being green.

## Strangler module order

Dependency-ordered; each module = one `rebuild/m<N>-<name>` branch, commit per task, merged into `rebuild/main` after gates pass. **Per-module done-when (applies to every module):**
1. Its characterisation-suite slice green against the new implementation (quirk disposition table in the PR: keep / drop+delete-test / fix+rewrite-test, one line of reasoning each).
2. ≥1 NEW integration test crossing the module's seam (listed per module below).
3. code-reviewer pass + logic-gap-harness sweep scoped to the module (D12).
4. `npm run build` + full suite green; no `--no-verify`.

---

### M0: Foundations & safety net (first, everything depends on it)

**Files:**
- Create: `packages/contracts/` (zod schemas: User, Trip, TripPoints, Policy, PoolShare, Quote, PendingPayment, Money, ScoreBreakdown — single source; both apps + functions import it)
- Create: `packages/scoring/` (pure: computeTripMetrics port, scoreFactor/±15% helper, refund calculator — THE one implementation; property tests)
- Create: `pnpm-workspace.yaml`, root tsconfig project refs, CI workflow with real gates (no continue-on-error deploys, lint+typecheck+unit+E2E jobs)
- Modify: `firestore.rules` (resolve the merge conflict per D13; add the missing top-level `achievements` read rule; decide admin custom-claim)
- Create: `tests/rules/` — @firebase/rules-unit-testing suite against the emulator (blocked until the conflict fix; first real rules coverage)
- Create: staging completion runbook (enable Email/Password provider, Blaze, deploy functions+rules to driiva-staging, seed test users via existing script) — unblocks the parked E2E walker + authenticated flows

**Interfaces:**
- Produces: `@driiva/contracts` (zod schemas + inferred types), `@driiva/scoring` (`computeTripMetrics(points: TripPoint[], startMs: number): TripMetrics`, `scoreFactor(score)`, `calculateRefund(...)` — signatures frozen here; every later module consumes these exact names)

**New integration test:** rules emulator suite proving the trip status-transition lock + the achievements read fix.

**Steps (execution detail — this module can start the moment sign-off lands):**
- [x] Scaffold pnpm workspace; move nothing yet (old app untouched); `packages/contracts` with the 9 schemas above, each with a vitest snapshot test pinning the current Firestore doc shapes from docs/rebuild/audit-data-shapes.md - *done: `1ead076`*
- [x] Port `functions/src/utils/helpers.ts:224-489` scoring into `packages/scoring` verbatim first (characterisation: same inputs → same outputs as the existing trigger tests), THEN property-test determinism (fast-check: score ∈ [0,100], permutation-stable point ordering) - *done: `a2f304e`, `4928f15`*
- [x] Fix firestore.rules conflict (keep the HEAD comment + authenticated leaderboard read ,  that was the intent of both sides); run the new rules emulator suite; diff `firebase firestore:rules get` output vs repo before any deploy - *done: `3415065`*
- [x] CI: replace the fake-green paths (deploy-staging continue-on-error removed; test job includes Playwright against the dev server) - *done: `ae7ed93`*
- [ ] Commit per step; suite green throughout

### M1: Identity & onboarding

Scope: Firebase Auth (email/password + Google + passkeys), **one** user-provisioning path (an Auth `onCreate` trigger creates the Firestore user doc + defaults — closes the fire-and-forget signup hole and the Google-signup bootstrap gap), onboarding flow (12 steps, draft resume kept), **one** `onboardingComplete` source of truth (Firestore; the Postgres flag and the PATCH-401 wall die with D1), email verification with a deliberate skip policy, session lifecycle incl. a revocation path (none exists today).
Quirk dispositions to decide in-module: dead `onboardingCompleted` field (drop), verification-skip-forever (keep? product call), raw Firebase error leak (fix), 11-dots-for-12-steps (fix).
**New integration test:** signup → provisioning trigger → onboarding completion → dashboard, against the Auth+Firestore emulator (the currently-parked E2E walker, unskipped and pointed at the new stack).

### M2: Trips & scoring pipeline

Scope: tripService streaming (keep the June-hardened batch-index contract - pinned tests carry over), scoring via `@driiva/scoring` in ONE idempotent Cloud Function (event-versioned trip doc; kills the double-fire and the four-implementation split), trip history + detail + route map, anomaly handling (persist-flagged vs reject policy made explicit), phone-usage weight either wired or removed-and-renormalised (CONTEXT.md Rule 8 either way).
**New integration test:** emulator round-trip - endTrip status flip → function scores → profile updated EXACTLY once (regression lock on the double-fire).
**Status (21 Jul 2026):** `rebuild/m2-trips` merged to main. A whole-branch-review follow-up (T9) closed separately - server-side refund in `server/lib/telematics.ts` repointed from the retired `shared/refundCalculator.ts` shim to the canonical `@driiva/scoring` source; the policy page's displayed refund rate now gates on the same `projectedRefund > 0` condition and unrounded score as the projected-refund figure, fixing a live rate showing next to a "no refund" result at the 69.5-70 score boundary. Display-only, no scoring or refund formula changed.
**M2-DEC-1 closed (18 Aug 2026):** the phone-usage weight is wired, not removed - `computeTripMetrics` takes a client-reported pickup count (web `visibilitychange` proxy; mobile accelerometer heuristic), sanitised and rate-capped server-side before it can move a score. Merged to main (`f520505`); see `docs/rebuild/m2-dec-1-phone-usage.md`. The mobile heuristic is still unverified on a real device.

### M3: Dashboard, leaderboard, community pool — **blocked on D6**

Scope: dashboard reads from denormalised user doc (one writer), leaderboard single store + scheduled ranker (UK timezone — kills the America/New_York pool crons and the LA-default leaderboard), pool ledger per D6, ONE refund figure derived from ONE function everywhere (kills ×100 bug, the /policy dual-formula, the rewards hardcoded 0).
**New integration test:** trip completed → leaderboard + pool share reflect it after the scheduled run; displayed refund == `calculateRefund` output in pence at every surface.

### M4: Pricing, payments & policy

Scope: server-authoritative pricing (client engine becomes display-only estimator labelled as such; D7 postcode model), Stripe checkout/subscription with the existing allow-list contract, **webhook → durable outbox → worker** (kills the swallow-then-200; payment_failed/subscription.deleted get real handlers with policy-state effects), Root adapter behind an interface (sandbox creds + currency resolution are prerequisites — manual-verify items 1-3), policy lifecycle state machine with an audit trail.
**New integration test:** signed Stripe webhook → outbox row → policy state transition, with a forced Firestore failure proving redelivery works (the exact money-in/no-cover scenario).
**Status (18 Aug 2026):** `rebuild/m4-payments` merged to main (`702256d`) - idempotent `stripe_events` ledger, real `payment_failed`/`subscription.deleted`/`checkout.session.completed` handlers, policy lifecycle state machine with an audit trail, `RootAdapter` interface seam (unverified pending Root sandbox creds), and the pool-contribution emit seam (M3's consumer is blocked on D6, so it only logs today).

### M5: Compliance & ops

Scope: GDPR erasure/export spanning all stores per D8, structured audit logging (real FCA-audit-trail posture for systemLogs), admin panel rebuilt on server-side Admin API endpoints (requireAdmin — never client-SDK reads; kills findings §0.5 #7), monitoring with real error surfacing (mounted Toaster equivalent, Sentry verified), cookie consent + retention config (resolves the 12-month-vs-90-day contradiction with ONE configured value; feeds the DPIA gap list §0.3).
**New integration test:** erasure request → all stores empty + third-party deletion calls issued (mocked) + audit record written.

### M6: Rewards, achievements, AI coach

Scope: achievements (seeded catalogue with rules that allow reading it; admin-gated seeding), rewards with a real milestone store or an honest "coming soon" (today it's fake UI — product call), AI coach behind a provider config (central model id — no per-call-site hardcodes; retire-proof per the StrydeOutreach lesson), cost caps.
**New integration test:** trip completion unlocks an achievement exactly once; coach endpoint returns the validated shape with the provider mocked.

### M7: Mobile app (Expo) — after web modules stable (D5)

Scope: EAS properly configured (eas.json, per-env googleServicesFile), consume `@driiva/contracts` + typed client, real screens over the M1-M6 backends (no stub tabs shipped as if real), Damoov per D10, the six Maestro flows go green against real behaviour (dead-route flow deleted with its route fixed).
**New integration test:** Maestro suite passes on a from-source EAS simulator build in CI.
**Status (24 Aug 2026):** `feat/fable-day` merged to main (`5c12303`). Drive is an instrument rather than a record button, detection is armed for the session from `DriveDetectionHost` rather than by a mounted screen, and a drive now ends on wall-clock time when the fixes dry up rather than only on samples it is given. Two fabricated inputs died with it: the phone-pickup count was never called by any app code, so phone usage (10% of the score) had been contributing a silent perfect 100 to every score Driiva ever produced, and `closeTrip` was writing 0,0 as an end position. Trip submission worked for the first time end to end once the rules-doomed `tripPoints` write was dropped on both mobile and web, and `@driiva/contracts` was vendored into the functions bundle - every deploy since `db3dcd8` had failed source analysis, so prod had been running the 5 Jul build with no phone-usage weight and no refund cap. Proof is the iOS simulator only. A physical-device run is still owed, and it is exactly the case the simulator cannot answer, having no accelerometer.

### M8: Claims — **blocked on D11**

Scope: undefined until the claims/GAP definition lands. Placeholder port: `ClaimsProvider` interface in contracts so M4's policy model doesn't paint us into a corner.

---

## Ownership patches (from the harness's unverified-but-accepted titles)
- Premium-payments → pool-contributions wiring (§0.2 flow 8's second half): owned by the **M3/M4 seam** — M4's payment outbox emits a pool-contribution event; M3's ledger consumes it. Neither module closes without the joint integration test.
- DPIA refresh + Damoov Art.28 DPA verification + cookie consent + retention config (§0.3 gap 6 remainder): owned by **M5**, explicitly listed in its scope.
- Push notifications (FCM) end-to-end + feedback widget: owned by **M6** (engagement layer), with stale-token pruning (audit EDGE-08) in scope.
- Stripe decline/3-D Secure UX: owned by **M4** (manual-verify item 4 becomes an M4 acceptance step with Stripe test cards).

## Logic-gap harness status (Phase 1d gate)
Run wf_d1f926df-487 (2 Jul): find phase complete — 35 raw findings; verify panel confirmed 2 HIGH (both folded in above: migration workstream H1, deploy isolation H2) and refuted 33; ~10 findings' verification was cut off by the session token limit (resets 01:40). The unverified titles were triaged by hand into the Ownership patches + D14-D16 + Launch gate sections above. To re-run the remaining verifiers from cache: `Workflow({scriptPath:"~/.claude/workflows/logic-gap-harness.js", resumeFromRunId:"wf_d1f926df-487", args:<same>})`.

## Self-review notes
- Spec coverage: every findings-§0.2 flow maps to a module (auth/onboarding→M1, trips/scoring→M2, dashboard/leaderboard/pool→M3, payments/insurance→M4, GDPR→M5, rewards/achievements/AI→M6, mobile→M7, claims→M8); §0.3 gaps surface as D6/D8/D11 decision points rather than invented answers.
- The suite-slice mapping uses the characterisation IDs (API-nn, FLOW-nn, MOB-Tnn, DATA-nn) so per-module plans can enumerate their slice mechanically from docs/rebuild/.
- No placeholder tasks except the two explicitly BLOCKED modules, which are blocked on YOUR definitions (D6, D11) — that's the ask, not an omission.
