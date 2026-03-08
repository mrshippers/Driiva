# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**For every session in this repo, start with:**
*"Read CLAUDE.md and ROADMAP.md. Work on the next unchecked ticket only, and update the ticket list when done."*

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

---

## Stack

| Layer                    | Technology                                                                      |
| ------------------------ | ------------------------------------------------------------------------------- |
| Frontend                 | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Wouter, TanStack Query |
| Maps                     | Leaflet (OpenStreetMap)                                                         |
| Auth                     | Firebase Authentication (email/password + Google)                               |
| Database                 | Cloud Firestore (primary); Neon PostgreSQL (telematics/server-side)             |
| Backend API              | Node.js Express (`server/`) + Firebase Cloud Functions (`functions/`)           |
| AI                       | Anthropic Claude Sonnet 4 (trip analysis); feature-flagged                      |
| Insurance API            | Root Platform (scaffolded; needs credentials)                                   |
| Payments                 | Stripe (deps installed, not wired)                                              |
| Trip metrics (canonical) | `shared/tripProcessor.ts` — distance (m), duration (s)                          |
| Trip classifier          | Python Stop-Go-Classifier (`functions-python/`); HTTP from TypeScript functions |

---

## Architecture overview

This is a monorepo: `client/` (React SPA), `server/` (Express), `functions/` (Firebase Cloud Functions), `shared/` (canonical types and trip math). See **ARCHITECTURE.md** for the full technical spec.

### Trip processing pipeline (critical path)

```
1. Trip recorded (GPS via client/src/pages/trip-recording.tsx → stored in tripPoints/{tripId})
2. Firestore trigger (onTripStatusChange: recording → processing)
   └─> functions/src/triggers/trips.ts
   └─> Haversine distance via shared/tripProcessor.ts
   └─> Python Stop-Go-Classifier (HTTP) → tripSegments/{tripId}
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

---

## Scoring and refund pool

- **Scoring:** `functions/src/utils/helpers.ts::computeDrivingScore()`. Events from `detectDrivingEvents()` (thresholds: −3.5 m/s² braking, 3.0 m/s² accel, 31.3 m/s speed). Deterministic — historical trips are never retroactively modified.
- **Refund eligibility:** Personal score ≥ 70. Formula: `(0.8 × personalScore + 0.2 × communityScore=75) → refundRate 5%–15% × safetyFactor`. Hard cap: refund ≤ premium × 15%. All amounts in integer cents.

---

## Trip classifier

Python Stop-Go-Classifier (`functions-python/stop_go_classifier.py`). Called via HTTP from `functions/src/http/classifier.ts` (env: `CLASSIFIER_URL`). Thresholds: min stop interval 63s, relevant stop duration 178s. Output stored in `tripSegments/{tripId}`.

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
