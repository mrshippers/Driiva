# Driiva — Current sprint (tickets)

**External memory for AI sessions:** Work on the next unchecked ticket only; update this list when done.

---

## Sprint: "Damoov & Feedback" (Week 0 — Telematics + Compliance)

- [x] Damoov telematics integration (server-side: user registration on signup, daily sync Cloud Function) — *done: `functions/src/lib/damoov.ts` API client; `onUserCreate` trigger stores deviceToken; `syncDamoovTrips` scheduled function at 00:30 UK daily with maxInstances:10*
- [x] Feedback collection system (Settings → FeedbackModal → Firestore) — *done: star rating + freetext widget in settings; writes to `feedback/{autoId}`; admin dashboard at `/admin/feedback`*
- [x] GDPR-compliant privacy/terms for telematics data — *done: Damoov named as Article 28 data processor; telematics consent clause; rewards framing (FCA-clean)*
- [x] Firestore security rules for feedback + systemLogs — *done: authenticated create on feedback; admin SDK only on systemLogs*
- [ ] XGBoost risk model wired to drivingProfile scores (next sprint)
- [ ] Community pool calculation using aggregated drivingProfile data
- [ ] Rewards eligibility logic (Tesco/Halfords/Nectar thresholds based on overallSafetyScore)

## Sprint: "Make It Real" (Week 1–2)

*If you've already done keys, Firebase login, deploy, or Root contact, check those off.*

- [ ] Create Anthropic account and set API key as Firebase secret
- [ ] Run `firebase login` and authenticate
- [ ] Deploy Cloud Functions (`firebase deploy --only functions`)
- [ ] Deploy Firestore rules and indexes
- [ ] Contact Root Platform for sandbox credentials
- [x] Fix CORS (restrict to driiva.com) — *done: server uses `CORS_ORIGINS` env, no wildcard; set to driiva.com in prod*
- [x] Add password reset flow — *done: /forgot-password page + "Forgot password?" link in signin + route registered in App.tsx*
- [ ] Test full flow: signup → onboarding → record trip → see score → see AI insights

## Sprint: "Make It Safe" (Week 3–4)

- [x] Set up Sentry for error monitoring (frontend + Cloud Functions) — *done: client/src/lib/sentry.ts + functions/src/lib/sentry.ts; SentryErrorBoundary in main.tsx; wrapFunction/wrapTrigger helpers*
- [x] Add Content Security Policy headers — *done: added to server/middleware/security.ts securityHeaders; 'unsafe-inline' for style-src documented (required by Tailwind/Leaflet)*
- [x] Set up GitHub Actions CI/CD pipeline — *done: .github/workflows/ci.yml; jobs: lint-and-typecheck, build (client+server), functions-build, test; triggers on push/PR to main*
- [x] Write first batch of tests (auth flow, scoring algorithm, trip processing) — *done: 197 tests passing across 12 files; covers auth-flow, scoring, trip-metrics, insurance, feature-flags, GDPR, AI analysis, leaderboard, pool scheduling, trip triggers, policy triggers, server API routes*
- [x] Set up staging Firebase project — *done: `driiva-staging` project provisioned; `.env.staging` configured; `.firebaserc` alias set; `build:staging`/`dev:staging` scripts added; `deploy-staging` CI job wired; Firestore rules + indexes deployed; `functions/.env.driiva-staging` created for CF staging overrides. Remaining manual steps: upgrade to Blaze plan → deploy functions; set FIREBASE_TOKEN + VERCEL_* GitHub Secrets; create Neon staging branch; create Vercel staging project.*
- [x] Add Firebase Analytics initialisation — *done: getAnalytics() in client/src/lib/firebase.ts; guarded by VITE_FIREBASE_MEASUREMENT_ID; try/catch for ad-blocker safety*
- [x] Implement email verification — *done: sendEmailVerification() in signup.tsx; emailVerified field on User type in AuthContext; ProtectedRoute hard-redirects unverified users to /verify-email (skipEmailVerificationCheck=true on /quick-onboarding and /verify-email routes); verify-email.tsx page with resend + check flow*
- [x] Backend & database security audit — *done: 12 issues found and fixed across Firestore rules, PostgreSQL, Cloud Functions, and API routes. See DRIIVA_CHANGELOG.md for full details.*

## Sprint: "Make It Payable" (Week 5–6)

- [ ] Build Stripe checkout for premium payments
- [ ] Build Stripe webhook handlers (payment success, subscription changes)
- [ ] Wire premium payments to community pool contributions
- [ ] Test Root Platform quote → accept → policy flow end-to-end
- [ ] Add premium amount display on policy page
- [ ] Set `ENCRYPTION_KEY` env var in production (required — server now refuses to store telematics data without it)

## Sprint: "Make It Polished" (Week 7–8)

- [x] Add push notifications (trip complete, score update, payment due) — *done: FCM init in firebase.ts, firebase-messaging-sw.js service worker, usePushNotifications hook, Cloud Function triggers on trip complete + achievement unlock, sendWeeklySummary scheduled function (Mondays 9AM UK)*
- [ ] Build service worker for offline/PWA support
- [x] Fix dashboard map — was hardcoded to London; now requests device GPS on load, handles permission denied and GPS unavailable states gracefully
- [x] Wire up profile page to real data — *done: Member since reads from Firestore createdAt; policyNumber never hardcoded; displayName falls back to fullName field; memberSince added to DashboardData*
- [x] Tier 3 animation polish (Revolut-level) — *done: ScoreRing radial gauge replaces flat bar; dashboard cards use container/item stagger variants; BottomNav has whileTap spring scale + layoutId sliding indicator; trip cards have whileHover lift; onboarding steps use scaleIn with elastic easing*
- [x] Implement trip route visualisation on map (show the actual driven path, not just current position) — *done: TripRouteMap component with Polyline + start/end markers; TripDetail page at /trips/:tripId; trip cards clickable in trips list*
- [x] AI Driving Coach feedback widget — *done: AIFeedbackWidget component with round-robin engagement comments, Perplexity API integration (8s timeout, 1 retry, silent fallback), Firebase ai_feedback_events logging, glassmorphic UI with pulsing AI orb; wired into trip-detail page*
- [x] Rewards Programme redesign — *done: 5-tier RewardsTimeline component (#Day5 Tesco £5, #Day10 RAC trial, #TeamDriiva Halfords £10, #Month3 500 Nectar pts, #Anniversary Amazon £25); vertical mobile / horizontal desktop; lock/unlock/claimed states; FCA-compliant framing; Web Share API; wired into rewards page*
- [x] Card/Default unification — *done: GlassCard component now uses dashboard-glass-card spec; unified bg/border/radius/padding/shadow across all card instances*
- [x] Phone usage detection for scoring — *done: `detectDrivingEvents()` in `functions/src/utils/helpers.ts` now analyses accelerometer magnitude deltas (threshold 4.0 m/s²) to detect phone pickups while driving (>2 m/s). Feeds into existing `computePhoneUsageScore()`. Graceful: defaults to 100 when no sensor data available.*
- [x] Build achievements backend — *done: 8 achievement definitions in functions/src/utils/achievements.ts; checkAndUnlockAchievements called after trip completion; Firestore collections (achievements/{id}, users/{uid}/achievements/{achId}); seedAchievements admin callable; frontend wired to real data*
- [x] Weather API integration — *done: Open-Meteo archive API in functions/src/utils/weather.ts; maps WMO codes to clear/cloudy/rain/snow/fog/storm; 3s timeout + graceful null fallback; wired into both trip triggers in trips.ts*

## Sprint: "Observation Mode" (Live Monitoring)

*Transition from build to observe. Wire up monitoring, metrics, and alerting across the full stack. Implementation guide: `docs/MONITORING_PROMPT.md`.*

- [ ] Complete Sentry wiring — `wrapFunction`/`wrapTrigger` on all 27 Cloud Functions; `setSentryUser` in AuthContext
- [ ] Add Firebase Performance Monitoring — client SDK + custom trace utility (`performanceTraces.ts`)
- [ ] Add structured metrics logging — trip pipeline, classifier, AI analysis with `[metric]` tags for Cloud Monitoring
- [ ] Add Vercel Analytics + Speed Insights — Web Vitals (LCP, INP, CLS), page latency, geographic distribution
- [ ] Configure alerting — Cloud Monitoring policies (error rate >5%, cold start >3s, Firestore write failures), Sentry alert rules, watchdog function (`monitorTripHealth`: failed trips, GPS drop-off, stuck trips)

## Remaining features not yet in any sprint

These are known gaps that don't have tickets yet:

- [x] **Weather API** — *done: Open-Meteo archive API (free, no key). `functions/src/utils/weather.ts` fetches WMO weather codes and maps to clear/cloudy/rain/snow/fog/storm. Wired into trip processing triggers. 3s timeout, graceful fallback to null.*
- [ ] **Root Platform credentials** — scaffolded but not wired. Needs sandbox creds from Root to test quote → bind → policy flow. Once wired, the `/api/insurance` endpoints become live.
- [ ] **Stripe wiring** — dependencies installed, tables exist, webhooks scaffolded. Premium payments and pool contributions not yet connected end-to-end.
- [x] **Profile page real data** — *done: profile.tsx reads from useDashboardData hook; edit mode for name/phone/vehicle writes to Firestore via updateDoc; loading skeletons on every section; error state with retry*
- [x] **Trip route visualisation** — TripRouteMap component + TripDetail page wired.
- [x] **Phone pickup detection** — *done: accelerometer-based detection in `detectDrivingEvents()`. Magnitude delta threshold (4.0 m/s²) while driving (>2 m/s). Feeds `phonePickupCount` into `computePhoneUsageScore()` (10% weight). Backward-compatible: defaults to 100 when no sensor data.*
- [x] **Push notifications** — FCM wired end-to-end: trip complete, achievement unlock, weekly summary.
- [x] **Leaderboard rank recalculation** — Firestore scheduled function now filters weekly/monthly by lastTripAt period bounds and uses dense ranking for tied scores. PG table remains stale (not primary).
- [x] GDPR data export — implemented GET /api/gdpr/export/:userId; returns JSON of all user data
- [x] GDPR data delete — implemented DELETE /api/gdpr/delete/:userId; strictly rate-limited
- [x] **Achievements backend** — 8 definitions, unlock logic in Cloud Functions, frontend wired to real Firestore data.
- [ ] **WebAuthn/Passkey login** — `server/webauthn.ts` is scaffolded but not exposed as a real login flow in the frontend.
- [ ] **Staging environment** — no Firebase staging project exists yet. Recommended before any production payments go live.

## Sprint: "Observation Mode" (Live Monitoring)

- [x] Complete Sentry wiring — wrapFunction/wrapTrigger on all Cloud Functions; setSentryUser in AuthContext
- [x] Add Firebase Performance Monitoring — client SDK + custom trace utility (`performanceTraces.ts`)
- [x] Add structured metrics logging — trip pipeline, classifier, AI analysis with `[metric]` tags for Cloud Monitoring
- [x] Add Vercel Analytics + Speed Insights — Web Vitals, page latency, geographic distribution
- [x] Configure alerting — watchdog function (`monitorTripHealth`) for failed trips, GPS drop-off, stuck trips; health endpoint enhanced with version/checks

## Completed (reference)

- [x] Cloud Functions build fixed
- [x] Trips page wired to real Firestore data
- [x] AI insights feature flag
- [x] Root Platform integration scaffolded
- [x] CORS fixed (origin allowlist via `CORS_ORIGINS`; no wildcard)
- [x] CLAUDE.md, ROADMAP.md, and ARCHITECTURE.md added; trip-processor source of truth; regression report and investor doc
- [x] Dashboard map now uses device GPS instead of hardcoded London coordinates
- [x] AI Risk Scoring & Insights engines finalized
- [x] GDPR export/delete endpoints live
- [x] Sentry set up (error monitoring)

---

*Update the checkbox when a ticket is done. Add new tickets at the top of the relevant sprint.*
