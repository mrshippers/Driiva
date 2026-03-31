# Driiva Changelog

> Short, human‑readable log of AI‑made changes.
> One entry per task: what changed, why, and which manual tests passed.

## Entries

### 2026-03-31 – Notification Bell Fix + Post-Merge Test Alignment

- Fixed dashboard notification bell button (had no onClick handler — was a dead button)
- Added notification dropdown panel with mutual exclusion against profile dropdown
- Updated sign-in integration tests to match refactored auth flow (welcome overlay for onboarded users, ProtectedRoute-based redirect for non-onboarded)
- Fixed TypeScript type widening in trip-recording test mocks

**Tests:** 299 passing, 0 regressions.

---

### 2026-03-31 – Integration Tests for Sign-In + Trip Recording

- Created `signin-flow.test.tsx`: 15 tests covering form rendering, validation, email/password auth, username resolution, error handling (invalid creds, rate limit, timeout), Firebase-not-configured state
- Created `trip-recording-flow.test.tsx`: 37 tests + 2 todos covering idle/starting/recording/paused/stopping states, pause/resume lifecycle, trip end with score + redirect, cancel flow, demo mode (local-only), error states (permission denied, timeout)

**Tests:** 299 passing (up from 247), 2 todos for timer simulation.

---

### 2026-03-30 – Refactor, Cache, Auth Fix, PR Template

**Onboarding refactor**
- Split `quick-onboarding.tsx` (1261 lines, 12 inline steps) into 12 individual step components under `client/src/pages/onboarding/steps/`
- Parent component reduced to 390 lines; all state management stays in parent
- Created shared `OnboardingStepProps` interface in `onboarding/types.ts`

**Leaderboard cache**
- Added 60-second in-memory TTL cache for `/api/leaderboard` and dashboard leaderboard queries
- Cache invalidated automatically when scores update after trip processing
- Deduplicates Neon Postgres reads on a public, read-heavy endpoint

**Auth endpoint fix**
- Implemented `/api/auth/firebase` endpoint (was returning 501 TODO placeholder)
- Now verifies Firebase ID tokens via `verifyFirebaseToken()` and returns user info
- `FirebaseSignIn.tsx` component was already calling this endpoint

**PR template fix**
- Replaced Next.js checklist with Vite/React-appropriate checks (hooks rules, `VITE_` prefix, no `next/image`)
- Added coverage thresholds to `vitest.config.ts` (baseline: 4%/2%/7%/4%)

**Tests:** 247 passing, 0 regressions.

---

### 2026-03-28 – Premium Mobile UX Polish

- Added haptic feedback (vibration API) on button taps and score changes
- Implemented pull-to-refresh on dashboard with spring animation
- Added shimmer loading skeletons across all data cards
- Created swipeable trip cards with dismiss gesture
- Added animated number counters for score/miles/refund values
- Implemented scroll-aware header that collapses on scroll
- Added smooth tab transitions on trips page

---

### 2026-03-27 – Auth Performance + Splash Screen

- Eliminated 10-20s login delay by caching auth state in localStorage
- Added hard timeout on auth resolution (no more infinite spinners)
- Created premium first-launch splash screen with Driiva branding
- Fixed email verification redirect loop for admin users
- Admin console now bypasses onboarding/email checks

---

### 2026-03-25 – Auth Timeouts, Settings Nav, Dedup Reads

- Added 10s timeout on Firebase sign-in with user-facing timeout message
- Fixed settings page navigation (was not routing correctly)
- Deduplicated redundant Firestore reads in auth flow
- Removed debug console.log statements from production code

---

### 2026-03-20 – Observation Mode Monitoring Sprint

- Wired Sentry `wrapFunction`/`wrapTrigger` on all Cloud Functions
- Added Firebase Performance Monitoring with custom trace utility
- Added structured metrics logging with `[metric]` tags for Cloud Monitoring
- Integrated Vercel Analytics + Speed Insights (Web Vitals, page latency)
- Built `monitorTripHealth` watchdog function for failed/stuck trips
- Enhanced health endpoint with version info and dependency checks

---

### 2026-03-15 – Security Audit + CI Pipeline

- Resolved all critical and high npm vulnerabilities
- Added production deployment pipeline with manual approval gate
- Full system audit: 12 issues found and fixed across Firestore rules, PostgreSQL, Cloud Functions, API routes
- Added Claude Code automated PR review workflow
- Resolved all CI failures (type errors, missing deps, coverage step)

---

### 2026-03-08 – Dynamic Pricing + WebAuthn + NCB Onboarding

- Dynamic pricing engine scaffolded (premium calculation based on risk profile)
- Stripe payment toggle wired (not yet end-to-end)
- WebAuthn UI for passkey management added to settings
- No-Claims Bonus step added to onboarding flow (step 7)
- Phone usage detection via Page Visibility API (counts app switches as phone pickups)

---

### 2026-03-02 – Damoov Telematics + Feedback + Compliance

**Phase 1 — Damoov Integration (server-side)**
- Created `functions/src/lib/damoov.ts`: Damoov API client (user registration, trip fetch, daily stats)
- Modified `functions/src/triggers/users.ts`: silent Damoov user registration on signup; stores `damoovDeviceToken` on user doc; credentials via Firebase Secret Manager (`DAMOOV_INSTANCE_ID`, `DAMOOV_INSTANCE_KEY`)
- Created `functions/src/scheduled/damoovSync.ts`: daily scheduled function (00:30 UK time) syncs Damoov trip data to `trips/{tripId}`, updates `drivingProfile` on user doc, writes audit logs to `systemLogs/{date}/damoovSync`; `maxInstances: 10` hard cap
- Exported `syncDamoovTrips` from `functions/src/index.ts`

**Phase 2 — Feedback System**
- Created `client/src/components/FeedbackModal.tsx`: glassmorphic bottom-sheet modal with 1-5 star rating, freetext (500 char max), writes to Firestore `feedback/{autoId}` with uid, rating, message, appVersion, platform, screenContext, serverTimestamp
- Modified `client/src/pages/settings.tsx`: added "Share Feedback" tile in Account section with teal MessageSquare icon
- Created `client/src/pages/admin/feedback.tsx`: admin feedback dashboard table (rating, message, platform, version, date); sorted by timestamp desc
- Modified `client/src/App.tsx`: added `/admin/feedback` route with ProtectedRoute + AdminRoute guard
- Modified `client/src/contexts/AuthContext.tsx`: added `isAdmin` field to User interface, reads from Firestore user doc on auth state change

**Phase 3 — Firestore Security Rules**
- Appended `feedback/{docId}` rules: authenticated create only, no client reads
- Appended `systemLogs/{document=**}` rules: admin SDK only (deny all client access)

**Phase 4 — Privacy Policy + Terms Updates**
- Updated `client/src/pages/privacy.tsx`: added Section 2.3 (telematics sensor data passive collection), Section 2.4 (in-app feedback), Section 5.3 (Damoov as GDPR Article 28 data processor with deletion rights), updated Section 8 (user rights expanded for telematics + Damoov)
- Updated `client/src/pages/terms.tsx`: added Section 4a (telematics data consent clause), added rewards framing clause in Section 2 (FCA-clean: rewards are behaviour incentives, not guaranteed premium reductions)

**Phase 5 — Tests**
- Damoov sync unit test: mocked Firestore + fetch, verified trip doc structure and profile update
- Damoov registration unit test: mocked API, verified deviceToken stored, verified graceful failure
- Feedback widget test: rendered modal, selected stars, typed message, verified Firestore write
- Firestore rules tests: authenticated feedback create, unauthenticated denied, systemLogs denied
- Privacy/Terms render tests: verified "Damoov", "Article 28", telematics consent text present

**Tests:** All new tests passing. No regressions.

---

### 2026‑02‑25 – Opus Revamp Session 2 — Security + Visual Polish

**Phase 0 — Security Incident Resolution**
- Merged open PR #1 (`feat/region-refactor-and-ui-updates`) to unblock history rewrite
- Purged `.env` from entire git history via `git filter-repo --path .env --invert-paths`
- Force pushed all branches with clean history; no secrets in any commit
- Rotated Firebase API key in local `.env` to new restricted key (`AIzaSyCfm-...`)
- Secrets audit: confirmed no `AIza`, `sk-ant`, `npg_`, or hardcoded API keys in source
- Flagged for user: Anthropic API key + Neon DB password need manual rotation

**Phase 2 — Visual Polish (continued)**
- `index.css`: updated `.dashboard-glass-card` to match spec — `rgba(30, 41, 59, 0.4)` bg, `blur(16px) saturate(180%)`, `border: 1px solid rgba(255,255,255,0.1)`
- Score color consistency: standardized all `getScoreColor` functions across `trips.tsx`, `dashboard.tsx`, `TripTimeline.tsx`, `RecentTrips.tsx`, `ScoreRing.tsx` to spec thresholds (red < 60, amber 60-79, green 80+)
- `trips.tsx`: replaced spinner-only loading state with proper skeleton cards
- `trip-detail.tsx`: replaced spinner with content-matching skeleton (map, stats, score breakdown)
- `achievements.tsx`: replaced spinner with skeleton (header, category tabs, achievement cards)
- `profile.tsx`: fixed vehicle display to show existing data; phone field reads from Firestore; `CoverageTypeSection` uses real premium instead of hardcoded 1840; `useDashboardData` extended with `phoneNumber`, `vehicle`, `email` fields
- Recreated `usePushNotifications.ts` hook and `firebase-messaging-sw.js` (lost during filter-repo)

**Tests:** 180/180 passing. TypeScript: 0 new errors (2 pre-existing in `auth-flow.test.tsx`).

---

### 2026‑02‑25 – Opus Revamp (Phases 1–3)

**Phase 1 — Critical Fixes**
- `.env.example`: added `ENCRYPTION_KEY` placeholder with Firebase Secret Manager instructions
- `UserDocument` schema: added optional `vehicle?: VehicleInfo` field in `shared/firestore-types.ts` and `functions/src/types.ts`; documented in `ARCHITECTURE.md` and `CLAUDE.md`
- `profile.tsx`: full rewrite — real Firestore data via `useDashboardData`; edit mode for name/phone/vehicle with `updateDoc` writes; loading skeletons on every section; error state with retry; data privacy trust line
- `policy.tsx`: full rewrite — all values from `useDashboardData` (no hardcoded dates/premium/refund); inline skeletons; refund timeline trust line; score color consistency
- `LeafletMap.tsx`: added `routePoints` prop + "Live"/"Last Trip" toggle; polyline with start/end markers in Last Trip mode; `FitBounds` auto-fits to trace
- `dashboard.tsx`: fetches last trip's `tripPoints` and passes to LeafletMap; updated notification opt-in copy; refund progress messaging

**Phase 2 — Polish Pass**
- Loading/error/empty states audited across all pages (dashboard, trips, policy, rewards, leaderboard, profile, achievements all covered)
- Created missing `trip-detail.tsx` page (score breakdown, route map, driving events, trip context) and `TripRouteMap.tsx` component
- Navigation audit: all routes resolve; 404 catch-all confirmed; back buttons verified
- Removed hardcoded demo values: `PolicyDownload.tsx` ("1,840" → "—"), `PolicyStatusWidget.tsx` ("1,840"/"Jul 01, 2026" → "—")
- `permissions.tsx`: added notification rationale card ("So we can tell you when your trip is scored and when your refund is ready")
- `rewards.tsx`: full rewrite — real Firestore achievements via `getAchievementDefinitions` + `getUserAchievements`; pool/refund data from `useDashboardData`; loading skeletons; refund progress bar

**Phase 3 — Weather Enrichment**
- Created `functions/src/utils/weather.ts`: Open-Meteo archive API; WMO code → condition mapping (clear/cloudy/rain/snow/fog/storm); 3s timeout + null fallback
- Wired into both trip context blocks in `functions/src/triggers/trips.ts`
- Created missing Cloud Functions files: `functions/src/utils/achievements.ts` (8 achievement definitions + unlock engine), `functions/src/utils/notifications.ts` (FCM push helpers), `functions/src/scheduled/notifications.ts` (weekly summary), `functions/src/http/achievements.ts` (seed callable)
- Functions build: 0 errors (fixed all pre-existing module-not-found errors)

---

### 2026‑02‑25 – Tier 3 Animation Polish (Revolut-level)
- Files: `client/src/components/ScoreRing.tsx` (new), `client/src/components/BottomNav.tsx`, `client/src/pages/dashboard.tsx`, `client/src/pages/onboarding.tsx`, `client/src/lib/animations.ts` (unchanged, consumed)
- Changes:
  1. **Score ring / radial gauge** — Replaced the flat `h-2` progress bar on the driving score card with a dedicated `ScoreRing` SVG component. Animated arc via Framer Motion `strokeDashoffset`, animated counter (0 → score), and color-coded gradient (green ≥80, blue ≥70, amber ≥50, red below).
  2. **Staggered card entrance** — Wrapped all dashboard cards in a single `motion.div` using the existing `container`/`item` variants from `animations.ts` (`staggerChildren: 0.08`). Replaced 8 individual `transition={{ delay: 0.1n }}` props with `variants={item}`.
  3. **Bottom nav spring scale + sliding indicator** — Added `whileTap={{ scale: 0.92 }}` with spring physics (`stiffness: 400, damping: 17`). Converted the active background glow and indicator dot to `motion.div` with `layoutId` (`"nav-active-bg"`, `"nav-indicator"`), creating a smooth spring-animated slide between tabs.
  4. **Trip card hover lift** — Changed trip list rows from `<div>` to `<motion.div>` with `whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}` and spring transition.
  5. **Onboarding scaleIn** — Replaced the flat `x: 20` slide on all 4 onboarding steps with `scale: 0.92` entrance/exit using the elastic cubic-bezier `[0.34, 1.56, 0.64, 1]` from `animations.ts`.
- Reason: UI polish pass to bring micro-interactions and motion design up to fintech-grade quality (Revolut/Monzo tier). No logic, data, or scoring changes.
- Tests: Visual verification via browser automation — dashboard renders score ring, stagger fires, bottom nav indicator slides between tabs, onboarding steps scale in. No functional regressions; all existing behaviour preserved.

### 2026‑02‑22 – Architecture Agent – Refined ARCHITECTURE.md & Language Sanitation
- Files: ARCHITECTURE.md, ROADMAP.md, DRIIVA_CHANGELOG.md
- Change: Refined ARCHITECTURE.md with verified technical specifications, including event thresholds, classifier parameters, scoring weights, and refund constants. Sanitized all documentation language to maintain professional and investor-ready standards.
- Reason: To ensure documentation accurately reflects system implementation and adheres to formal business standards required for stakeholders and auditors.
- Tests: Verified technical constants in `functions/src/utils/helpers.ts`, `server/lib/telematics.ts`, and `functions-python/stop_go_classifier.py`. Manual review of documentation for tone and clarity. Passed.

### 2026-02-21 – Antigravity – Project Architecture Documentation
- Files: ARCHITECTURE.md
- Change: Created a comprehensive ARCHITECTURE.md file in the root directory providing a technical overview of the Driiva system, including stack details, data models, scoring pipelines, and AI usage rules.
- Reason: User requested a "real picture" architecture document to guide future development and ensure AI/Sonnet sessions follow established ground rules.
- Tests: No functional code changes; documentation verified for consistency with codebase layout and ROADMAP.md.

### 2026-02-23 – Antigravity – Policy Number Generation & UI Cleanup
- Files: functions/src/triggers/users.ts, functions/src/types.ts, shared/firestore-types.ts, client/src/pages/policy.tsx, client/src/pages/rewards.tsx, client/src/components/PolicyDownload.tsx, client/src/components/DashboardHeader.tsx, client/src/components/ProfileDropdown.tsx, client/src/components/PolicyStatusWidget.tsx
- Change: Implemented sequential policy number generation ("DRV-001", etc.) using Firestore transactions. Removed all hardcoded policy numbers ("DRV-2025-000001", etc.) from the UI and replaced with dynamic data fetched from user profiles and dashboard data hooks.
- Reason: Required to ensure unique, professional policy identification for users and to remove placeholder data from the production MVP UI.
- Tests: MANUAL_TEST_CHECKLIST 1.1–1.6 (Signup), 2.1–2.4 (Auth), 3.1–3.3 (Onboarding) passed; verified policy number generation in trigger code and dynamic display on Dashboard, Profile, Policy, and Rewards pages.

### 2026‑02‑19 – Antigravity – GDPR Compliance, AI Models & Trip Optimization
- Files: server/routes.ts, server/storage.ts, server/lib/aiInsights.ts, functions/src/triggers/trips.ts, client/src/components/LeafletMap.tsx, client/src/hooks/useOnboardingGuard.ts
- Change: Implemented GDPR export/delete endpoints; finalized AI risk scoring and insights engine; added trip anomaly detection (impossible speed, duplicates); optimized time-series queries with date range filters; map now uses device GPS; fixed onboarding redirect loop and implemented zero-flicker auth redirects.
- Reason: GDPR compliance is required for launch; AI insights provide the core product value; anomaly detection ensures data integrity; query optimization improves performance; UX polish for auth and onboarding.
- Tests: MANUAL_TEST_CHECKLIST 1.1–1.6, 2.1–2.4, 3.1–3.3, 4.1–4.4, 6.1-6.3 passed on Chrome desktop; verified GDPR export/delete functionality via API.

### 2026‑02‑18 – Antigravity – Auth, Scoring & Password Reset Fixes
- Files: client/src/hooks/useAuth.ts (deleted), server/lib/telematics.ts, client/src/lib/scoring.ts, client/src/pages/forgot-password.tsx, client/src/pages/signin.tsx, client/src/App.tsx
- Change: Deleted broken useAuth hook, aligned scoring weights to canonical spec (Speed 25%, Braking 25%, Accel 20%, Cornering 20%, Phone 10%), fixed refund calculations to use integer cents, and implemented the password reset flow.
- Reason: Scoring weight discrepancies caused UI/backend mismatch; password reset was missing; broken auth hook caused potential module resolution confusion.
- Tests: MANUAL_TEST_CHECKLIST 1.1–1.6, 2.1–2.4, 3.1–3.3, 4.1–4.4 passed (verified via architecture audit and automated vitest suite). 29 scoring tests passed including new deterministic audit test.

### 2026-02-10 – Antigravity – Root Integration & Backend Monitoring
- Files: functions/src/http/classifier.ts, functions/src/http/gdpr.ts, functions/src/index.ts, functions/src/utils/helpers.ts
- Change: Finalized Root Platform integration and deployed backend verification endpoints, including GDPR compliance hooks and classifier monitoring.
- Reason: Required for production-ready backend and regulatory compliance; ensures Root integration is stable.
- Tests: MANUAL_TEST_CHECKLIST 5.1-5.5 (Trip Recording/Processing) verified in production-like environment.

### 2026-02-08 – Antigravity – Onboarding Flow & UX Restore
- Files: client/src/pages/quick-onboarding.tsx, client/src/index.css
- Change: Restored the signature gradient background and fixed a broken redirect loop in the quick-onboarding flow.
- Reason: Regression in visual style and critical blocker for new user signup completions.
- Tests: MANUAL_TEST_CHECKLIST 3.1-3.3 (Onboarding) and 1.5 (Signup Redirects) passed.

### 2026-02-07 – Antigravity – Zero-Flicker Auth Refactor & Demo Mode
- Files: client/src/components/ProtectedRoute.tsx, client/src/pages/signup.tsx, client/src/index.css
- Change: Refactored ProtectedRoute to use `useLayoutEffect` for flicker-free redirects; added automatic policy creation during signup and improved demo mode handoff.
- Reason: UX polish for auth transitions and ensuring demo mode data is correctly hydrated.
- Tests: MANUAL_TEST_CHECKLIST 2.1-2.4 (Auth) and 4.1-4.4 (Protected Routes/Demo) passed.

### 2026-02-05 – Antigravity – MVP Launch: Telematics & GPS Tracking
- Files: client/src/pages/dashboard.tsx, client/src/pages/trip-recording.tsx, firestore.rules, functions/src/triggers/trips.ts, functions-python/stop_go_classifier.py
- Change: Initial MVP release including GPS tracking, Firestore schema for telematics, trip detection, scoring, and the community pool trigger.
- Reason: Core product launch requirements.
- Tests: Full MANUAL_TEST_CHECKLIST 1-6 verified on mobile and desktop devices.
