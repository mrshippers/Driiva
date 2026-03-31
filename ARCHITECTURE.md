# Driiva Architecture

**Last updated:** 13 March 2025

This document provides a technical specification of the Driiva platform. It serves as the primary technical reference for developers and auditors.

---

## 0. AI / Sonnet Ground Rules

For every Sonnet session in the repo, start with:

> Read `CLAUDE.md` and `ROADMAP.md`.  
> Work on the next unchecked ticket only, and update the ticket list when done.

 No architectural or logic changes should be proposed until existing development milestones are successfully completed and verified.

---

## 1. System Overview

Driiva is a React + Firebase telematics stack that turns raw GPS into:

- Trips and driving events
- A 0–100 driving score
- A refund share from a community pool

High‑level flow:

1. User signs up (Firebase Auth).
2. Frontend records or imports trip data (GPS points + metadata).
3. Trip points are stored in Firestore under `tripPoints/{tripId}`.
4. Backend (Cloud Functions + Node server) processes points into metrics, events, and a driving score.
5. User profile + pool share are updated.
6. Insurance stack (Root + MGA) handles policy + claims; Stripe handles payments (wired in later).

 Modifying these components requires rigorous validation, as they direct impact financial calculations and insurance risk assessment.

---

## 2. Stack Overview

### 2.1 Runtime Stack

| Layer                    | Technology                                                                      |
| ------------------------ | ------------------------------------------------------------------------------- |
| Frontend                 | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Wouter, TanStack Query |
| Animation system         | Framer Motion variants (`client/src/lib/animations.ts`); stagger, spring, layoutId transitions |
| Maps                     | Leaflet (OpenStreetMap)                                                         |
| Auth                     | Firebase Authentication (email/password + Google)                               |
| Database                 | Cloud Firestore (NoSQL, real-time)                                              |
| Backend                  | Firebase Cloud Functions (Node.js 20) + Node server where needed                |
| AI                       | Anthropic Claude Sonnet 4 (trip analysis); feature-flagged                      |
| Insurance API            | Root Platform (scaffolded; needs credentials)                                   |
| Payments                 | Stripe (deps installed, not wired)                                              |
| Trip metrics (canonical) | `shared/tripProcessor.ts` — distance (m), duration (s)                          |
| Trip classifier          | Python Stop-Go-Classifier (functions-python); HTTP from TypeScript functions    |

**MVP reality:** everything in this table exists in the repo. Root, Stripe, and some AI flows are scaffolded / behind flags rather than fully live.

### 2.2 Where Code Lives (Map)

- `web/` or `app/` – React frontend
- `functions/` – Firebase Cloud Functions (TypeScript, Node 20)
- `functions-python/` – Python classifier service
- `server/` – Node server code (telematics + refund logic)
- `shared/` – Shared TypeScript utilities (`tripProcessor.ts` is the source of truth)
- `docs/` – Docs (including this file, ROADMAP, etc.)

If you add a new service or folder that matters for architecture, update this section.

---

## 3. Data Model (Firestore)

### 3.1 Collections

- **`users/{userId}`**  
  Driver profile:
  - `drivingProfile` – `score`, `totalTrips`, `totalMiles`, `totalDrivingMinutes`, `scoreBreakdown`
  - `activePolicy` – reference to policy
  - `poolShare` – current community pool share
  - `recentTrips[]` – cached summary for dashboard
  - `fcmTokens`, `settings`
  - `vehicle` – optional `VehicleInfo` (make, model, year, color, VIN); populated from onboarding
  - `createdBy` / `updatedBy` for audit

- **`trips/{tripId}`**  
  One document per trip:
  - `userId`
  - `startedAt` / `endedAt`
  - `durationSeconds`
  - `startLocation` / `endLocation` (lat, lng, address, placeType)
  - `distanceMeters`
  - `score`, `scoreBreakdown`
  - `events` – `hardBraking`, `hardAcceleration`, `speedingSeconds`, `sharpTurnCount`, `phonePickupCount`
  - `anomalies`
  - `status` – `recording | processing | completed | failed | disputed`
  - `context`
  - `pointsCount`
  - Optional `segmentation` shortcut from classifier

- **`tripPoints/{tripId}`**  
  Raw GPS points:
  - `points[]` with:
    - `t` – offset ms
    - `lat`, `lng`
    - `spd` – m/s × 100
    - `hdg`
    - `acc`
    - optional `ax/ay/az`, `gx/gy/gz`
  - For long trips: `tripPoints/{tripId}/batches/{batchIndex}` for batched storage.

- **`policies/{policyId}`**  
  Policy metadata and Root sync info.

- **`communityPool`**  
  Singleton doc with pool state for the current period.

- **`poolShares/{period_userId}`**  
  Per‑driver pool share per period:
  - status: `active | finalized | paid_out`
  - financial amounts in integer cents.

- **`leaderboard/{period}`**  
  Precomputed rankings for `weekly | monthly | all_time`.

- **`tripSegments/{tripId}`**  
  Classifier output:
  - `stops[]`
  - `trips[]` (start/end time, duration)
  - `samples[]` (per‑point label, `is_stop`).

### 3.2 Conventions

- Distance in **meters**, duration in **seconds**.
- Money in **integer cents** only.
- Timestamps are **ISO 8601**.
- Sensitive/financial docs must have `createdBy` / `updatedBy`.

---

## 4. Trip Classifier (Driving vs Walking/Dwelling)

Goal: Ensure that only valid driving segments contribute to insurance metrics and refund eligibility.

### 4.1 Role

- Distinguish:
  - **Stops / dwelling** – parked, walking, idle.
  - **Trips** – actual driving segments.
- Output drives:
  - Trip validity
  - Prevention of fraudulent data submission (data farming).
  - Data integrity for scoring (excluding non-driving movement).

### 4.2 Implementation (MVP Reality)

- Python Stop‑Go‑Classifier (Spang et al.; FOSS4G) at  
  `functions-python/stop_go_classifier.py`.
- Exposed via HTTP; TypeScript calls it from  
  `functions/src/http/classifier.ts`.
- Configured via `CLASSIFIER_URL` / `classifier.url`.

**Input:**

- GPS points converted to planar (x, y) coordinates + timestamps.
- Minimum ~23 points for stable classification (window sizes range from 14 to 23).

**Methods used (inside the classifier):**

- Motion score (threshold: 1.30, scaling from 0.29 to 3.00)
- Rectangle‑distance ratio (RDR) (threshold: 1.95, window: 23)
- Bearing analysis (threshold: 41, window: 15)
- Start–end distance (SEDA) (threshold: 95, window: 14)
- Intersecting segments (ISA) (threshold: 0.75, window: 19)
- Thresholds for:
  - Min stop interval: **63s**
  - Relevant stop duration: **178s**
  - Min distance between stops: **37m**
  - Relevant distance between stops: **165m**
  - Max time between stops for merge: **175s**

**Output:**

- `stops[]`
- `trips[]` (start/end time, duration)
- `samples[]` (per‑point label, `is_stop`)

Persisted in `tripSegments/{tripId}` and optionally copied onto `trips/{tripId}.segmentation`.

### 4.3 Future‑State Vision

- Tightening thresholds per market (urban vs rural).
- Classifier features surfaced in the UI as explainability (“we excluded this walking segment”).
- Potential migration to an in‑house or hybrid model if needed for scale/latency.

---

## 5. Scoring Pipeline

We turn raw GPS into a 0–100 score. Deterministic, no secret adjustments after the fact.

### 5.1 Canonical Metrics

- Canonical trip metrics live in `shared/tripProcessor.ts`:
  - Distance: Haversine over sequential GPS points, in meters (**R=6371e3**).
  - Duration: First-to-last timestamp difference, in seconds.
- This file is the single source of truth across:
  - Cloud Functions
  - Node server
  - Any offline tools

Modifications to this shared utility impact all trip evaluations across the ecosystem; updates must be accompanied by comprehensive unit testing and documentation revision.

### 5.2 Event Detection

- Core logic in `functions/src/utils/helpers.ts` and `server/lib/telematics.ts`:
  - `computeTripMetrics()` – uses `tripPoints` to derive distance, duration, etc.
  - `detectDrivingEvents()` – identifies:
    - **Hard braking:** $≤ -3.5$ m/s² (or $> 0.3g$ lateral/longitudinal)
    - **Hard acceleration:** $≥ 3.0$ m/s² (or $> 0.2g$)
    - **Speeding:** Above **31.3 m/s** (~70 mph) or **+5 km/h** over local limit
    - **Sharp turns:** Heading change rate $> 30^\circ$/s or lateral force $> 0.25$
    - Phone pickups (when wired)

### 5.3 Driving Score

- Score range: **0–100**.
- Weighting:

  - Speed: **25%**
  - Braking: **25%**
  - Acceleration: **20%**
  - Cornering: **20%**
  - Phone usage: **10%** (Currently hardcoded to 100/100 until phone detection is implemented)

- Pipeline:

  1. `computeTripMetrics()` turns points into metrics (sampled every **1s**, min movement **5m**).
  2. `detectDrivingEvents()` tags events.
  3. `computeDrivingScore()` folds events + metrics into a single composite score.
  4. Anomaly detection identifies and penalizes fraudulent or anomalous data (GPS jumps $> 5$km in $< 1$m, speed $> 200$ km/h, or duplicate records).

- Implementations:

  - Firebase path: `functions/src/utils/helpers.ts`.
  - Server path: `server/lib/telematics.ts` (`TelematicsProcessor.processTrip()`).

**Deterministic:** same inputs = same score. Once a trip is scored and stored, we do not silently rewrite history.

### 5.4 Future‑State Vision

- ML‑assisted scoring (XGBoost model) sitting on top of the deterministic metrics.
- Personalisation by driver, vehicle type, and context (night, weather, road type) under strict audit.

---

## 6. Refund Pool Logic

The platform incentivizes low-risk driving behavior through a community-based refund system.

### 6.1 Eligibility (MVP Reality)

- Driver’s **personal score ≥ 70** to be eligible for a refund.
- Community pool logic based on both:
  - Personal performance
  - Pool performance (benchmarked against a group average of **75**).

### 6.2 Formula (Server)

Inside `server/lib/telematics.ts`:

- `calculateRefund()`:

  - Base score: **80%** personal score + **20%** community score.
  - Refund rate:
    - **5%** at weighted score 70
    - Linearly up to **15%** at weighted score 100.
  - Multiplied by pool **safety factor** (typically 0.8–1.0).
  - Hard cap: `refund ≤ premium × 15%`.

All money logic uses integer **cents** end‑to‑end.

### 6.3 Firebase Helpers

In `functions/src/utils/helpers.ts`:

- `calculateProjectedRefund(score, contributionCents, safetyFactor, refundRate)`
- Pool period helpers:
  - `getCurrentPoolPeriod()`
  - `getShareId()`

Trip triggers in `functions/src/triggers/trips.ts`:

- `updateDriverProfileAndPoolShare()`:
  - Updates `users/{userId}.drivingProfile`
  - Updates relevant `poolShares/{period_userId}` doc.

### 6.4 Future‑State Vision

- Multiple pool types (friends‑only, regional, driving profile‑based).
- Dynamic pool safety factors based on claims experience.
- Deeper Root integration so refunds/adjustments sync straight through to policies.

---

## 7. AI / Sonnet Usage

AI is utilized for analytical enrichment and developer productivity; it does not govern production logic or financial decisions.

### 7.1 MVP Reality

- Anthropic Claude Sonnet 4 used for:
  - Trip analysis experiments (finalized Risk Scoring & Insights engines)
  - Developer assistance (via `CLAUDE.md` + ROADMAP)
- Feature‑flagged in the app; **no critical path depends on AI** today.
- GPS Sampling: **1000ms** (1s) interval.
- Batching: Every **100 points** or **10 seconds** (`FLUSH_INTERVAL`).

### 7.2 Rules

- Always start with:  
  `Read CLAUDE.md and ROADMAP.md. Work on the next unchecked ticket only, and update the ticket list when done.`
- No changes to money maths, scoring weights, or data retention logic without human review.
- Any architectural change proposed by AI must be written up as a short ADR / ticket before implementation.

### 7.3 Future‑State Vision

- Sonnet‑powered trip narratives (“here’s why this score dropped”).
- AI-facilitated support tools maintain human-in-the-loop oversight for all insurance-related or claims-impacting decisions.

---

## 8. Integrations (Insurance, Payments, Maps)

### 8.1 Insurance – Root Platform

- Root acts as:
  - Pricing engine
  - Policy issuance
  - Claims handling backbone
- Current state:
  - API scaffolded
  - Credentials/env wiring pending
  - Not yet used in any real‑money flow

When Root goes live, we treat it as the source of truth for policy state; Driiva focuses on telematics + engagement.

### 8.2 Payments – Stripe

- Stripe packages installed.
- Not wired into live flows yet.
- Will handle:
  - Premium collection
  - Refund payouts or credits

Stripe integration must respect the same cents‑only convention and pool caps.

### 8.3 Maps – Leaflet

- Frontend uses Leaflet with OpenStreetMap.
- Used for:
  - Trip visualisation
  - Start/end markers
- No sensitive logic sits client‑side; server remains the source of truth for scores and refunds.

---

## 9. Security, Privacy, Compliance

### 9.1 Data Minimisation

- We collect:
  - Trip GPS data
  - Derived events/scores
  - Basic profile and policy info
- We do **not** collect:
  - Contacts, messages, or personal content from devices.
- No “always‑on” 24/7 tracking: we track trips, not lives.

### 9.2 Storage & Access

- All traffic over HTTPS/TLS.
- Firestore and Storage encryption at rest.
- Access enforced with:
  - Firebase Security Rules
  - Backend checks (role‑aware, least privilege)
- Audit fields (`createdBy`, `updatedBy`) on sensitive/financial docs.

### 9.3 Regulatory Context

- ICO registration in place.
- Designed for UK GDPR:
  - Clear lawful basis
  - Data subject rights supported (access, delete, export).
- FCA sandbox process used on the insurance side; this architecture is built to survive that level of scrutiny.

---

## 10. Scalability & Reliability

### 10.1 MVP Reality

- Firebase Cloud Functions + Firestore auto‑scale with usage.
- Usage‑based billing matches early volumes (no idle servers).
- Trip processing is idempotent: we can safely re‑run processing if needed.

### 10.2 Future‑State Vision

- Move heavy analytics / retraining to separate jobs or services.
- Add rate limiting and per‑user caps to protect against abuse.
- Introduce more structured logging and alerting for trip processing failures.

---

## 11. MVP Reality vs Future‑State Snapshot

Keep this table honest. Investors and auditors screenshot this.

| Layer / Component       | Status (Today)                 | Notes                                                    |
|-------------------------|--------------------------------|----------------------------------------------------------|
| React frontend          | Production MVP                 | Core flows live; design system and animation polish production-ready |
| Trip storage            | Production MVP                 | `tripPoints` + `trips` + `tripSegments`                  |
| Classifier              | Production MVP                 | Python Stop‑Go; called via HTTP                          |
| Scoring (0–100)         | Production MVP                 | Deterministic rules from GPS + events                    |
| Refund pool             | Production MVP                 | Server logic running; cents‑only                         |
| Root integration        | Scaffold / Not live            | Needs real creds + full wiring                           |
| Stripe                  | Scaffold / Not live            | Deps installed; flows TBD                                |
| Sonnet AI in app        | Feature‑flag / Experimental    | Not on critical path                                     |
| Compliance (ICO/GDPR)   | Live processes                 | FCA sandbox work ongoing                                 |

When something moves from “Scaffold” or “Experimental” to “Production”, update this table the same day.

---

## 12. How to Use This Document

- For investors and auditors: this provides a comprehensive assessment of the platform's technical integrity and implementation status.
- For developers: this is the technical map. Align all development with these specifications.
- Maintenance: Developers are responsible for ensuring this documentation remains synchronized with the implementation, particularly regarding financial and risk logic.
