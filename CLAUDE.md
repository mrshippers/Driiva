# CLAUDE.md

**Last updated:** 13 March 2025

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**For every session in this repo, start with:**
*"Read CLAUDE.md and ROADMAP.md. Work on the next unchecked ticket only, and update the ticket list when done."*

---

## What Driiva is

Driiva is a UK telematics-based insurance platform: record a drive, get a 0–100 score, earn a share of a community pool back as a cash reward. The stack is Firebase-first (Auth + Firestore + Cloud Functions), with a Node/Express server deployed on Vercel and a Python FastAPI classifier for trip segmentation.

Target user: UK drivers who want to be rewarded for driving safely. The scoring is deterministic, the pool is actuarially capped, and the compliance posture is ICO-registered + FCA-sandbox-aligned.

---

## Commands

```bash
# Development
npm run dev                # Start Express server + Vite dev server (port 3001)

# Build
npm run build              # vite build (client) + esbuild bundle (server)
npm start                  # Start production server (dist/index.js)

# Type checking
npm run check              # tsc strict mode

# Testing
npm test                   # vitest run (all tests)
npm run test:watch         # vitest watch mode
npm run test:coverage      # vitest with v8 coverage

# Run a single test file
npm test -- client/src/__tests__/scoring.test.ts
npm test -- --grep "scoring"

# Database
npm run db:push            # Sync Drizzle schema to Neon PostgreSQL
```

Cloud Functions (from `functions/`):
```bash
npm run build              # tsc compile
npm test                   # vitest run
npm run serve              # firebase emulators:start --only functions
npm run deploy             # firebase deploy --only functions
```

Python classifier (from `api/`, separate process):
```bash
pip install -r requirements.txt
uvicorn main:app --port 5000
```

See **RUNBOOK.md** for full local dev, deploy, and debug procedures.

---

## Stack

| Layer | Technology |
| ------------------------ | ------------------------------------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Wouter, TanStack Query |
| Maps | Leaflet (OpenStreetMap) |
| Auth | Firebase Authentication (email/password + Google) |
| Database | Cloud Firestore (primary); Neon PostgreSQL (telematics/server-side) |
| Backend API | Node.js Express (`server/`) + Firebase Cloud Functions (`functions/`) |
| AI | Anthropic Claude Sonnet 4 (trip analysis); feature-flagged |
| Insurance API | Root Platform (scaffolded; needs credentials) |
| Payments | Stripe (deps installed, not wired) |
| Trip metrics (canonical) | `shared/tripProcessor.ts` — distance (m), duration (s) |
| Trip classifier | Python Stop-Go-Classifier (`api/`); HTTP from TypeScript functions |

---

## Hard Stops

These invariants are locked. Do not change them without explicit sign-off and a written ADR.

**Auth:** Firebase Auth is canonical. `server/auth.ts` (`SimpleAuthService`, bcrypt against Neon) is legacy-secondary — it exists for server-session patterns, not the UI login flow. The UI uses `onAuthStateChanged`. Never bypass `verifyFirebaseToken()` for protected API routes.

**Scoring determinism:** `shared/tripProcessor.ts` is the single source of truth for distance and duration. `computeDrivingScore()` in `functions/src/utils/helpers.ts` must remain deterministic — same inputs, same output, always. Historical trips are never retroactively modified after `status: completed`.

**Financials:** All money is integer cents, no floats, end-to-end. Hard cap: refund ≤ premium × 15%. The formula is `(0.8 × personalScore + 0.2 × communityScore) → refundRate 5%–15% × safetyFactor`. Do not touch this without actuary sign-off.

**Real-time:** Firestore `onSnapshot` listeners only. There is no WebSocket server — the `ws` dep in `package.json` is unused/transitive. There is no SSE. Do not add a second real-time layer without a design doc.

**Firestore as primary DB:** All live user/trip/pool state lives in Firestore. Neon PostgreSQL is secondary and structured — synced one-way (Firestore → Neon) by Cloud Function triggers `syncTripOnComplete` and `syncUserOnSignup`. Never write to Neon from the client. Never treat Neon as the authoritative source for a Firestore collection.

**Scoring weights:** Speed 25%, Braking 25%, Acceleration 20%, Cornering 20%, Phone 10%. Phone is hardcoded to 100/100 — this is a known gap tracked in ROADMAP.md, not a bug.

**Audit trail:** `createdBy` / `updatedBy` fields are required on all sensitive and financial Firestore documents. Do not omit them.

---

## Scaffolded (not live — don't assume these work)

- **Root Platform insurance** — API client in `functions/src/http/insurance.ts`. Needs sandbox credentials (`ROOT_API_KEY`, `ROOT_ENVIRONMENT=sandbox`) before any real-money flow. Until then, `/api/insurance` endpoints will fail.
- **Stripe** — deps installed (`stripe@18.3`), routes scaffolded in `server/routes.ts`. Not wired end-to-end. No checkout, no webhook handling, no pool contributions connected.
- **WebAuthn/Passkey** — `server/webauthn.ts` is fully implemented server-side (SimpleWebAuthn). Not wired to any frontend login flow yet.
- **Staging Firebase project** — `driiva-staging` provisioned; manual steps remain (Blaze, deploy functions, Vercel staging). Not fully live yet.
- **Python classifier** — lives in `api/` (FastAPI, port 5000), called via `CLASSIFIER_URL` env var. Not auto-started by `npm run dev`. Must be run separately or deployed to Cloud Run.
- **XGBoost risk model** — referenced in ROADMAP.md, not yet implemented. `api/main.py` has a mock `score-trip` endpoint.
- **Phone pickup detection** — scoring weight is 10% but hardcoded to 100. Accelerometer pattern recognition not implemented.

---

## Domain Map

| Domain | Where it lives | Owner | Done for next milestone |
| ---------------------- | -------------------------------------------------------------------------------- | ----------- | ------------------------------------------------ |
| Product / core | `client/`, `server/`, `functions/`, `shared/`, `api/` | Keith Cheng (Product Lead) | Root creds wired; Stripe checkout live |
| Telematics / AI | `api/main.py`, `functions/src/ai/`, `server/lib/aiInsights.ts` | Engineering | Phone detection wired; XGBoost model behind flag |
| Marketing / brand | `attached_assets/` (logo PNGs, concept docs) | TBD | Brand kit indexed; owner named |
| Compliance / GDPR | `client/src/pages/privacy.tsx`, `/terms`, `/trust`; `functions/src/http/gdpr.ts` | Legal + Eng | ICO registered; FCA sandbox ongoing |
| Legal / contracts | `attached_assets/*.docx` | Legal | Docs moved to `legal/`; owner named |
| Fundraising / investor | `attached_assets/` (concept framework, pricing PDFs) | Founder | Deck location pinned; one-pager live |
| Ops / infra | `RUNBOOK.md`, `.github/workflows/`, `firebase.json`, `vercel.json` | Engineering | Staging project live; RUNBOOK.md current |

---

## Architecture overview

This is a monorepo: `client/` (React SPA), `server/` (Express), `functions/` (Firebase Cloud Functions), `shared/` (canonical types and trip math), `api/` (Python classifier). See **ARCHITECTURE.md** for the full technical spec.

### Trip processing pipeline (critical path)

```
1. Trip recorded (GPS via client/src/pages/trip-recording.tsx → stored in tripPoints/{tripId})
2. Firestore trigger (onTripStatusChange: recording → processing)
   └─> functions/src/triggers/trips.ts
   └─> Haversine distance via shared/tripProcessor.ts
   └─> Python Stop-Go-Classifier (HTTP, CLASSIFIER_URL) → tripSegments/{tripId}
3. Driving score computed (deterministic)
   └─> functions/src/utils/helpers.ts::computeDrivingScore()
   └─> Weights: Speed 25%, Braking 25%, Acceleration 20%, Cornering 20%, Phone 10%
4. Refund pool share updated (onTripStatusChange: processing → completed)
   └─> functions/src/triggers/trips.ts::updateDriverProfileAndPoolShare()
```

**Server-side path:** `server/lib/telematics.ts::TelematicsProcessor.processTrip()` mirrors the Functions pipeline for direct API calls.

### Shared source of truth

`shared/tripProcessor.ts` is imported by Cloud Functions, Express server, and all tests. **Never duplicate its logic elsewhere.** It exports: `haversineMeters`, `tripDistanceMeters`, `tripDurationSeconds`, `tripDistanceAndDuration`.

---

## Firebase schema (Firestore)

- **users/{userId}** — `drivingProfile` (score, totalTrips, totalMiles, scoreBreakdown), `activePolicy`, `poolShare`, `recentTrips[]`, `vehicle?`, `fcmTokens`, `settings`, `createdBy`/`updatedBy`.
- **trips/{tripId}** — `userId`, `startedAt`/`endedAt`, `durationSeconds`, `startLocation`/`endLocation`, `distanceMeters`, `score`, `scoreBreakdown`, `events`, `status` (recording|processing|completed|failed|disputed).
- **tripPoints/{tripId}** — Raw GPS: `points[]` with `t` (offset ms), `lat`, `lng`, `spd` (m/s×100), `hdg`, `acc`; optional `ax/ay/az`, `gx/gy/gz`. Long trips batched under `tripPoints/{tripId}/batches/{batchIndex}`.
- **poolShares/{period_userId}** — Per-driver pool share; status active/finalized/paid_out. Amounts in integer cents.
- **leaderboard/{period}** — Precomputed rankings (weekly/monthly/all_time).
- **tripSegments/{tripId}** — Classifier output: stops, trip segments, samples (driving vs dwelling).
- **communityPool** — Singleton pool state and safety factor.

Full Firestore type definitions: `shared/firestore-types.ts`. Neon PostgreSQL schema: `shared/schema.ts`.

---

## Scoring and refund pool

- **Scoring:** `functions/src/utils/helpers.ts::computeDrivingScore()`. Events from `detectDrivingEvents()` (thresholds: −3.5 m/s² braking, 3.0 m/s² accel, 31.3 m/s speed). Deterministic — historical trips are never retroactively modified.
- **Refund eligibility:** Personal score ≥ 70. Formula: `(0.8 × personalScore + 0.2 × communityScore=75) → refundRate 5%–15% × safetyFactor`. Hard cap: refund ≤ premium × 15%. All amounts in integer cents.

---

## Trip classifier

Python Stop-Go-Classifier (`api/main.py`, FastAPI). Called via HTTP from `functions/src/http/classifier.ts` (env: `CLASSIFIER_URL`). Thresholds: min stop interval 63s, relevant stop duration 178s. Output stored in `tripSegments/{tripId}`. Must be running independently — not part of `npm run dev`.

---

## Conventions

- TypeScript strict; async/await; no hardcoded secrets — env vars only.
- Distances in meters, durations in seconds, financials in **integer cents** (no floats).
- Timestamps: ISO 8601.
- Audit trail: `createdBy`/`updatedBy` on sensitive and financial Firestore documents.
- Feature flags: `VITE_FEATURE_AI_INSIGHTS`, `VITE_FEATURE_COMMUNITY_POOL`, `VITE_FEATURE_LEADERBOARD`.

---

## Current roadmap

See **ROADMAP.md** for the current sprint and ticket list (external memory; update when closing tickets).
