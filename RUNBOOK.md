# RUNBOOK.md

**Last updated:** 13 March 2025

Single operations reference for Driiva. Read CLAUDE.md first for product context and hard stops.

---

## Local Development

### Start the main app

```bash
npm run dev
# Express API + Vite dev server at http://localhost:3001
```

### Start the Python classifier (separate terminal)

The classifier is **not** started by `npm run dev`. Trips will stall in `processing` without it.

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --port 5000
```

Then set `CLASSIFIER_URL=http://localhost:5000` in your root `.env`.

### Start Firebase emulators (optional)

Use when testing Cloud Functions locally without hitting the production Firestore.

```bash
cd functions
npm run serve
# Emulators: Functions :5001 | Firestore :8080 | Auth :9099 | UI :4000
```

### Run tests

```bash
npm test                    # all tests (vitest)
npm run test:coverage       # with v8 coverage report
npm test -- --grep "scoring"  # single pattern
npm test -- client/src/__tests__/scoring.test.ts  # single file

cd functions && npm test    # Cloud Functions tests
```

---

## Environment Setup

### Required vars before `npm run dev`

Copy `.env.example` → `.env`. Minimum to run locally:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
DATABASE_URL=                  # Neon PostgreSQL connection string
ENCRYPTION_KEY=                # 32-byte hex — generate: openssl rand -hex 32
CLASSIFIER_URL=http://localhost:5000
FIREBASE_SERVICE_ACCOUNT_KEY=  # Full JSON from Firebase Console → Service accounts
CORS_ORIGINS=http://localhost:3001
```

### Required vars before `npm run serve` (functions)

Copy `functions/.env.example` → `functions/.env`. Minimum:

```env
DAMOOV_INSTANCE_ID=
DAMOOV_INSTANCE_KEY=
ADMIN_EMAILS=your@email.com
FEATURE_AI_INSIGHTS=true
```

### All env vars (reference)

| Variable | Where used | Required | Notes |
| --- | --- | --- | --- |
| `VITE_FIREBASE_*` | Client | Yes | From Firebase Console → Project settings → Web app config |
| `VITE_FIREBASE_MEASUREMENT_ID` | Client | No | Firebase Analytics |
| `VITE_FIREBASE_VAPID_KEY` | Client | No | FCM push notifications |
| `VITE_FEATURE_AI_INSIGHTS` | Client | No | Feature flag; default off |
| `VITE_FEATURE_COMMUNITY_POOL` | Client | No | Feature flag; default off |
| `VITE_FEATURE_LEADERBOARD` | Client | No | Feature flag; default off |
| `VITE_SENTRY_DSN` | Client | No | Sentry error tracking |
| `VITE_AI_FEEDBACK_URL` | Client | No | AI feedback endpoint |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Server | Yes (prod) | Full JSON. Never expose client-side. |
| `DATABASE_URL` | Server | Yes | Neon PostgreSQL. Get from Neon dashboard. |
| `ENCRYPTION_KEY` | Server | Yes (prod) | AES key for telematics data at rest. Server refuses to store without it. |
| `ANTHROPIC_API_KEY` | Server | No | Claude Sonnet 4. Required only if `FEATURE_AI_INSIGHTS=true`. |
| `SENTRY_DSN_FUNCTIONS` | Functions | No | Sentry for Cloud Functions |
| `CORS_ORIGINS` | Server | Yes (prod) | Comma-separated. Set to `https://driiva.co.uk` in production. |
| `ROOT_API_KEY` | Functions | No | Root Platform insurance. Scaffolded; not live. |
| `ROOT_API_URL` | Functions | No | Root Platform base URL |
| `ROOT_ENVIRONMENT` | Functions | No | `sandbox` or `production` |
| `ROOT_PRODUCT_MODULE_KEY` | Functions | No | Root Platform module key |
| `STRIPE_SECRET_KEY` | Server | No | Stripe. Scaffolded; not live. |
| `STRIPE_WEBHOOK_SECRET` | Server | No | Stripe webhook validation |
| `DAMOOV_INSTANCE_ID` | Functions | Yes | Damoov DataHub API credentials |
| `DAMOOV_INSTANCE_KEY` | Functions | Yes | Damoov DataHub API credentials |
| `ADMIN_EMAILS` | Functions | No | Comma-separated. Auto-promoted to admin on signup. |
| `CLASSIFIER_URL` | Functions | Yes | URL of the Python classifier service |
| `WEBAUTHN_RP_ID` | Server | No | Passkey relying party ID. Scaffolded. |
| `WEBAUTHN_ORIGIN` | Server | No | Passkey origin. Scaffolded. |

Full credential walkthrough: [`docs/ENV_AND_FIREBASE_SETUP.md`](docs/ENV_AND_FIREBASE_SETUP.md).

---

## Deploy

### Frontend + Express → Vercel (primary path)

```bash
git push origin main
# CI (.github/workflows/ci.yml) runs: lint → build → test → deploy to Vercel
```

Manual override:

```bash
vercel --prod
```

Vercel serves the React SPA and wraps the Express server as a serverless function via `api/index.ts`. Config: [`vercel.json`](vercel.json).

### Cloud Functions + Firestore → Firebase

```bash
cd functions && npm run build
firebase deploy --only functions,firestore:rules,firestore:indexes --project default
```

For staging:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes --project staging
```

Firebase config: [`firebase.json`](firebase.json). Project aliases: [`  .firebaserc`](.firebaserc) (`default` → `driiva`, `staging` → `driiva-staging`).

> **Note:** The `driiva-staging` Firebase project alias exists in `.firebaserc` but the project has not been provisioned. Do not run staging deploy until the project is created in Firebase Console.

### Python classifier → Cloud Run (not yet deployed)

The classifier in `api/` must be hosted somewhere with a stable URL. Cloud Run is the recommended target.

```bash
# Build and push (example):
gcloud builds submit --tag gcr.io/driiva/classifier api/
gcloud run deploy driiva-classifier --image gcr.io/driiva/classifier --port 5000 --region europe-west2

# Then set CLASSIFIER_URL in Vercel and Firebase environment:
# CLASSIFIER_URL=https://driiva-classifier-<hash>-ew.a.run.app
```

### Firestore indexes and rules only

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Schema migrations (Neon PostgreSQL)

```bash
npm run db:push
# Syncs shared/schema.ts to Neon via Drizzle Kit
```

---

## CI/CD

Two workflows in [`.github/workflows/`](.github/workflows/):

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `ci.yml` | Push / PR to `main` | lint-and-typecheck → build → functions-build → test → deploy-staging |
| `deploy-staging.yml` | Push to `staging` branch | test → functions-build → deploy |

**Required GitHub Secrets:**

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_SENTRY_DSN
FIREBASE_TOKEN
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID_STAGING
# staging-only:
STAGING_DATABASE_URL
STAGING_ANTHROPIC_API_KEY
STAGING_ENCRYPTION_KEY
STAGING_FIREBASE_SERVICE_ACCOUNT_KEY
```

---

## Cron Jobs (Cloud Functions Scheduled)

All schedules are UTC.

| Export name | Schedule | What it does |
| --- | --- | --- |
| `syncDamoovTrips` | `30 0 * * *` (00:30 UTC daily) | Pull Damoov telematics trips into Firestore |
| `updateLeaderboards` | every 15 minutes | Recompute weekly / monthly / all-time rankings |
| `finalizePoolPeriod` | `0 0 1 * *` (1st of month, midnight UTC) | Lock pool period, compute payout amounts |
| `recalculatePoolShares` | `0 6 * * *` (06:00 UTC daily) | Recalculate per-driver pool shares |
| `sendWeeklySummary` | `0 9 * * 1` (Mondays 09:00 UTC) | FCM push — weekly driving summary to all users |
| `monitorTripHealth` | every 60 minutes | Watchdog: detect stuck trips, GPS drop-offs, pipeline failures |

Source files: [`functions/src/scheduled/`](functions/src/scheduled/).

---

## Database

### Firestore (primary)

- **Schema / types:** [`shared/firestore-types.ts`](shared/firestore-types.ts)
- **Security rules:** [`firestore.rules`](firestore.rules) — deploy with `firebase deploy --only firestore:rules`
- **Composite indexes:** [`firestore.indexes.json`](firestore.indexes.json) — deploy with `firebase deploy --only firestore:indexes`
- **Backup:** One snapshot in [`firestore-backup/`](firestore-backup/). Not automated — run manually before risky migrations.

### Neon PostgreSQL (secondary)

- **Schema:** [`shared/schema.ts`](shared/schema.ts) (Drizzle ORM)
- **Push schema changes:** `npm run db:push`
- **Connection:** `DATABASE_URL` env var (serverless driver via `@neondatabase/serverless`)
- **Data flows in from Firestore via:** `syncTripOnComplete` and `syncUserOnSignup` Cloud Functions triggers. Never write from the client.

---

## Debug Playbook

**Trip stuck in `processing`**
→ Check Cloud Functions logs: Firebase Console → Functions → Logs → filter `onTripStatusChange`.
→ Most common cause: `CLASSIFIER_URL` not set or the Python `api/` service is not running.
→ To unblock: set `status: failed` on the trip document manually, or re-trigger by updating `status` to `processing` again.

**Score is 100/100 for phone usage**
→ Known gap. Phone pickup detection is not implemented. The `phonePickupCount` event is hardcoded to 0 in `functions/src/utils/helpers.ts`. Tracked in ROADMAP.md.

**CORS errors in production**
→ Set `CORS_ORIGINS=https://driiva.co.uk` in Vercel environment variables. Do not use a wildcard.

**Admin panel 403 / not showing as admin**
→ Check `VITE_ADMIN_EMAILS` env var (comma-separated list) or set `isAdmin: true` directly on `users/{uid}` in Firestore Console.

**Sentry not capturing errors**
→ Client: confirm `VITE_SENTRY_DSN` is set in Vercel env.
→ Functions: confirm `SENTRY_DSN_FUNCTIONS` is set in Firebase Functions config.
→ Check that `wrapFunction`/`wrapTrigger` is applied to the failing function in `functions/src/`.

**Firebase Auth works locally but fails in preview deploy**
→ Add the preview URL to Firebase Console → Authentication → Settings → Authorized domains.

**Damoov sync not running**
→ Confirm `DAMOOV_INSTANCE_ID` and `DAMOOV_INSTANCE_KEY` are set in `functions/.env` (local) or Firebase Functions environment (prod).
→ Check `systemLogs` Firestore collection for sync run history.

**`ENCRYPTION_KEY` missing error on server start**
→ Generate: `openssl rand -hex 32`. Set as `ENCRYPTION_KEY` in Vercel env vars (prod) or root `.env` (local). Server refuses to process telematics data without it.

**Root Platform endpoints returning 401/403**
→ Root integration is scaffolded but not live. Requires `ROOT_API_KEY` and `ROOT_ENVIRONMENT=sandbox` from Root Platform. Contact Root to get sandbox credentials.

**Stripe webhooks not firing**
→ Stripe is not wired end-to-end. The `STRIPE_WEBHOOK_SECRET` route exists in `server/routes.ts` but the checkout and payment flows are not implemented.

---

## Monitoring and Observability

- **Sentry:** Error tracking for frontend (`client/src/lib/sentry.ts`) and Cloud Functions (`functions/src/lib/sentry.ts`).
- **Firebase Performance Monitoring:** Custom traces in `client/src/lib/performanceTraces.ts`.
- **Vercel Analytics + Speed Insights:** Web Vitals (LCP, INP, CLS) — active on production.
- **Cloud Monitoring:** Structured `[metric]` log tags in trip pipeline and classifier functions.
- **Admin panel:** Live monitoring dashboard at `/admin/monitoring` (or `admin.driiva.co.uk/admin/monitoring`).
- **Watchdog function:** `monitorTripHealth` runs hourly — alerts on stuck trips and GPS drop-offs.

Implementation notes: [`docs/MONITORING_ARCHITECTURE.md`](docs/MONITORING_ARCHITECTURE.md).

---

## Admin Subdomain

`admin.driiva.co.uk` → maps to `/admin/*` routes in the SPA.

Setup (5 min, one-time): [`QUICK_DEPLOY_ADMIN.md`](QUICK_DEPLOY_ADMIN.md).

Admin routes:
- `/admin` — Overview
- `/admin/monitoring` — Live monitoring (Sentry, performance, pipeline health)
- `/admin/users` — User management
- `/admin/trips` — Trip management
- `/admin/feedback` — Feedback viewer
- `/admin/system` — Damoov sync logs

---

## Secrets Management

| Secret | How to generate | Where to set |
| --- | --- | --- |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` | Vercel env vars (prod), root `.env` (local) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Console → Project settings → Service accounts → Generate new private key | Vercel env vars + GitHub Secrets. Never commit. |
| `FIREBASE_TOKEN` | `firebase login:ci` | GitHub Secrets (for CI deploy) |
| `DATABASE_URL` | Neon dashboard → Connection string | Vercel env vars, root `.env` |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Vercel env vars (server-side only) |
| `STRIPE_SECRET_KEY` | Stripe dashboard | Vercel env vars (not live yet) |
| `DAMOOV_INSTANCE_ID/KEY` | Damoov DataHub dashboard | Firebase Functions environment + `functions/.env` |

**Rules:**
- Never commit `.env`, `functions/.env`, or any file containing real credentials.
- `FIREBASE_SERVICE_ACCOUNT_KEY` must never appear in client-side code or be prefixed `VITE_`.
- Rotate `ENCRYPTION_KEY` only if explicitly required — existing encrypted telematics data will become unreadable.

---

## Useful Links

| Resource | URL |
| --- | --- |
| Firebase Console (prod) | https://console.firebase.google.com/project/driiva |
| Vercel Dashboard | https://vercel.com |
| Neon Dashboard | https://console.neon.tech |
| Sentry | https://sentry.io |
| Damoov DataHub | https://datahub.damoov.com |
| Root Platform | https://root.co.za |
| Stripe Dashboard | https://dashboard.stripe.com |

---

*Keep this file current. If a deploy step changes, update here the same day.*
