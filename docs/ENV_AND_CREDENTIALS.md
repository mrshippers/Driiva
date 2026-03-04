# Where to get credentials and env vars

One place to see **where to get the real PostgreSQL URL** and **every token / env var** the app uses.

**Short path:** See **docs/SETUP_NEON_AND_FIREBASE.md** for Neon “done correctly” and Firebase keys + Firestore. See **docs/FIREBASE_EXTENSIONS.md** for which extensions to install for MVP.

**Security:** Never commit `.env` (or any file with real secrets) to git, even in a private repo. `.env` is in `.gitignore` on purpose: private repos get leaked, go public, or get shared with contractors. Keep secrets in `.env` locally and in your host’s secret store (e.g. Neon env, Firebase config/secrets) in production.

---

## 1. PostgreSQL URL (Neon) — **required for server and Cloud Functions**

**Where it’s used**
- Server: `server/db.ts`, `drizzle.config.ts`, `scripts/verify-db.ts`
- Cloud Functions: `functions/src/lib/neon.ts` (sync user on signup, sync trip on complete)

**Where to get it**
1. Go to **[neon.tech](https://neon.tech)** and sign up / log in.
2. Create a **project** and a **database** (e.g. name `driiva`). Prefer an **EU region** (e.g. AWS Europe West 2 (London)) for GDPR.
3. In the dashboard, open **“Connect to your database”** or **Connection details**. Click **Show password** and copy the **full connection string**. You do **not** need the Neon CLI (`neonctl`) or Homebrew.
4. The URL looks like:
   ```text
   postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
   You may need to add `?sslmode=require` at the end if it’s not there.

**Where to set it**
- **Server (local):** In the **repo root** `.env`:
  ```bash
  DATABASE_URL="postgresql://USER:PASSWORD@ep-....neon.tech/neondb?sslmode=require"
  ```
- **Cloud Functions (deployed):** Same URL in Firebase config:
  ```bash
  cd functions
  firebase functions:config:set db.url="postgresql://USER:PASSWORD@ep-....neon.tech/neondb?sslmode=require"
  ```
  For local Functions emulator you can use a `functions/.env` with `DATABASE_URL=...` (if your code reads it; otherwise config is used).

**Before using:** Run `migrations/schema.sql` against this database once (Neon SQL Editor or `psql "$DATABASE_URL" -f migrations/schema.sql`).

---

## 2. Root `.env` (server + Vite client)

All of these are read from the **repo root** `.env` (Vite loads it for `VITE_*`; Node loads it for server vars).

| Variable | Required? | Where to get it | Used for |
|----------|-----------|------------------|----------|
| **DATABASE_URL** | ✅ Yes | Neon dashboard → connection string (see above) | Server DB; reject SQLite |
| **VITE_FIREBASE_API_KEY** | ✅ Yes (for real auth) | Firebase Console → **Project settings** (gear) → **General** → **Your apps** → Web app → **API Key** | Client Firebase Auth/Firestore |
| *(Email verification link)* | One-time | Firebase Console → **Authentication** → **Templates** → **Email address verification** → **Customize action URL** → set to your app’s verify page (e.g. `http://localhost:3001/verify-email` for dev, `https://yourdomain.com/verify-email` for prod). Then verification links use your app and your API key instead of Firebase’s default (avoids “API key expired” on the link). | So the link in the email opens your app and verification succeeds. |
| **VITE_FIREBASE_PROJECT_ID** | ✅ Yes (for real auth) | Same page: **Project ID** at top (e.g. `driiva`) | Client Firebase |
| **VITE_FIREBASE_APP_ID** | ✅ Yes (for real auth) | Same page: Web app → **App ID** (e.g. `1:894211619782:web:...`) | Client Firebase |
| **VITE_FIREBASE_AUTH_DOMAIN** | Optional | Defaults to `PROJECT_ID.firebaseapp.com` | Auth domain (only if different) |
| **VITE_FIREBASE_STORAGE_BUCKET** | Optional | Firebase Console → Storage | If you use Storage |
| **VITE_FIREBASE_MESSAGING_SENDER_ID** | Optional | Firebase Console → **Project settings** → **Cloud Messaging** → Sender ID (e.g. `894211619782`) | If you use FCM |
| **VITE_FIREBASE_MEASUREMENT_ID** | Optional | Firebase Console → Analytics | If you use Analytics |
| **GOOGLE_APPLICATION_CREDENTIALS** | Recommended (server) | Path to Firebase **service account** JSON file (Console → Project settings → Service accounts → Generate new key) | Server: verify Firebase ID tokens (`/api/profile/me`, protected routes) |
| **FIREBASE_SERVICE_ACCOUNT_KEY** | Alternative to above | Full JSON string of the service account key | Same as above when you can’t use a file path |
| **VITE_SENTRY_DSN** | Optional | Sentry.io → Project → Client keys (DSN) | Client error monitoring |
| **VITE_FEATURE_AI_INSIGHTS** | Optional | `true` / `false` | Toggle AI insights in client |
| **PERPLEXITY_API_KEY** | Optional | [Perplexity API](https://www.perplexity.ai/settings/api) | `/api/ask` only if you use it |
| **ENCRYPTION_KEY** | Optional | Any secret string | Trip telematics encryption at rest (default key used if unset) |
| **CORS_ORIGINS** | Optional | Comma-separated origins, e.g. `https://app.driiva.com,http://localhost:5173` | Server CORS (defaults include localhost) |
| **ADMIN_FIREBASE_UIDS** | Optional | Comma-separated Firebase UIDs | Admin-only routes (e.g. PUT community-pool) |
| **PORT** | Optional | e.g. `3001` | Server port (default 3001) |

---

## 3. Cloud Functions (deployed or emulator)

Set via **Firebase config** and/or **Firebase secrets** (and optionally `functions/.env` for local).

| Variable / config | Required? | Where to get it | Used for |
|-------------------|-----------|------------------|----------|
| **db.url** (config) | ✅ Yes (for sync) | Same Neon URL as `DATABASE_URL` | `syncUserOnSignup`, `syncTripOnComplete` |
| **ANTHROPIC_API_KEY** | If using AI trip analysis | [Anthropic Console](https://console.anthropic.com/settings/keys) | Claude AI trip analysis in Functions |
| **ROOT_API_KEY** | If using insurance | [Root Platform](https://app.rootplatform.com/) | Insurance API (Functions) |
| **ROOT_API_URL** | If using insurance | Root docs (e.g. sandbox URL) | Insurance base URL |
| **ROOT_ENVIRONMENT** | Optional | `sandbox` or `production` | Root API env |
| **ROOT_PRODUCT_MODULE_KEY** | Optional | Root product module key | Insurance product |
| **SENTRY_DSN_FUNCTIONS** | Optional | Sentry → Project → DSN | Functions error monitoring |
| **FEATURE_AI_INSIGHTS** | Optional | `true` / `false` | Turn off AI insights in Functions to save cost |
| **CLASSIFIER_URL** or **classifier.url** | Optional | Your Stop-Go classifier HTTP URL | Trip classification from Functions |

**How to set**
- Config (non-secret):  
  `firebase functions:config:set db.url="postgresql://..."`  
  `firebase functions:config:set classifier.url="https://..."`
- Secrets (API keys):  
  `firebase functions:secrets:set ANTHROPIC_API_KEY`  
  `firebase functions:secrets:set ROOT_API_KEY`

**Damoov (telematics sync)**  
- **DAMOOV_INSTANCE_ID** and **DAMOOV_INSTANCE_KEY** are required by `onUserCreate` and `syncDamoovTrips`. If they’re missing, `firebase deploy --only functions` fails.  
- To unblock deploy, placeholders were created:  
  `firebase functions:secrets:set DAMOOV_INSTANCE_ID` and `DAMOOV_INSTANCE_KEY` (e.g. value `placeholder`).  
- When you have real Damoov credentials, overwrite:  
  `firebase functions:secrets:set DAMOOV_INSTANCE_ID`  
  `firebase functions:secrets:set DAMOOV_INSTANCE_KEY`  
  then redeploy: `firebase deploy --only functions`.

**If Functions deploy fails (Cloud Build)**  
- Build runs in **europe-west2**. Open [Cloud Build history](https://console.cloud.google.com/cloud-build/builds?project=894211619782), filter by region **europe-west2**, open a failed build and check the **Build log** for the real error (e.g. missing dependency, Node version, or out-of-memory).  
- With **gcloud** installed:  
  `gcloud builds list --region=europe-west2 --project=driiva --limit=5`  
  then `gcloud builds log BUILD_ID --region=europe-west2 --project=driiva`.

---

## 4. Legacy / other (you may not need these)

| Variable | Where used | Note |
|----------|------------|------|
| **VITE_SUPABASE_URL** / **VITE_SUPABASE_ANON_KEY** | `test-auth.js`, `create-user.js`, `check-user.js`, `server/lib/auth-handler.ts` | Old Supabase usage; not needed if you use only Firebase + Neon. |
| **SUPABASE_URL** / **SUPABASE_ANON_KEY** (or NEXT_PUBLIC_*) | `server/lib/auth-handler.ts` | Same as above. |

If you’re not using Supabase, you can leave these unset and ignore those scripts/handlers.

---

## 5. Minimal set to “run and verify”

**Must have**
- **DATABASE_URL** (Neon) in root `.env` — server and DB verification.
- **VITE_FIREBASE_API_KEY**, **VITE_FIREBASE_PROJECT_ID**, **VITE_FIREBASE_APP_ID** in root `.env` — sign up / sign in and profile API from client.
- **db.url** (same Neon URL) in Functions config — so signup and trip completion sync to Postgres.

**Strongly recommended**
- **GOOGLE_APPLICATION_CREDENTIALS** or **FIREBASE_SERVICE_ACCOUNT_KEY** in root `.env` — so the server can verify Firebase tokens and `/api/profile/me` works.

**Optional**
- Everything else (Sentry, Perplexity, Root, Anthropic, feature flags, CORS, admin UIDs, classifier URL) only if you use those features.

---

## 6. When to input Neon and Firebase keys

| When | Where to set them | Why |
|------|-------------------|-----|
| **Local development (now)** | Root **`.env`** on your machine | App and server read from `.env`; you can test signup, DB, and API locally. |
| **Beta / staging** | Your host’s **environment** or **secrets** (e.g. Vercel, Railway, Replit, Render) | Same keys (or separate staging Neon/Firebase projects). Never commit `.env` to git. |
| **Production / go-live** | Host’s **production** env/secrets; optionally separate Neon branch and Firebase project | Use production DB and Firebase project; keep staging and prod separate. |

You don’t wait until beta to add keys — use them in **`.env`** for local testing now. For beta and live, add the same (or production) keys to whatever platform runs your app.

---

## 7. Quick checklist

- [ ] Neon project + DB created; **connection string** copied.
- [ ] `migrations/schema.sql` run against that DB.
- [ ] Root **`.env`**: `DATABASE_URL` = Neon URL; `VITE_FIREBASE_*` (API key, project ID, app ID).
- [ ] Root **`.env`**: `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_KEY` (for token verification).
- [ ] **Functions**: `firebase functions:config:set db.url="postgresql://..."`
- [ ] Deploy functions if you use signup/trip sync: `cd functions && npm run build && firebase deploy --only functions`

After that, you can run the six verification steps in **VERIFY_FLOWS.md** (including “real” Postgres URL and tokens as above).
