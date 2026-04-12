# Driiva — Env & Firebase: What 100% Should Look Like

One place to see every variable and every Firebase step. Use this for local `.env` and for **Vercel → Project → Settings → Environment Variables**.

---

## 1. Where to get Firebase values

1. Open [Firebase Console](https://console.firebase.google.com) → your project (e.g. **driiva**).
2. **Project settings** (gear) → **General** → scroll to **Your apps**.
3. If you don’t have a web app, click **Add app** → **Web** (</>).
4. You’ll see a config object. Map it like this:

| Firebase Console (e.g. "Config" object) | Your env variable |
|-----------------------------------------|--------------------|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |
| `measurementId` (optional) | `VITE_FIREBASE_MEASUREMENT_ID` |

5. **Service account (for server):**  
   Project settings → **Service accounts** → **Generate new private key**.  
   Copy the **entire JSON** and use it as `FIREBASE_SERVICE_ACCOUNT_KEY` (see below) or save to a file and use `GOOGLE_APPLICATION_CREDENTIALS` locally.

6. **Authorized domains (must do or auth will fail):**  
   **Authentication** → **Settings** → **Authorized domains**. Add:
   - `localhost` (for dev)
   - `app.driiva.co.uk` (or your production domain)
   - Your Vercel preview domain if you use it, e.g. `*.vercel.app` or the exact hostname

7. **Sign-in methods:**  
   **Authentication** → **Sign-in method** → enable **Email/Password** and **Google** (or whatever you use).

---

## 2. Final `.env` shape (local and reference for Vercel)

Copy this and replace placeholders. **Never commit `.env`** (it’s in `.gitignore`).

```env
# ========== FIREBASE — Client (required for auth to work) ==========
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=driiva.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=driiva
VITE_FIREBASE_STORAGE_BUCKET=driiva.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Optional
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_FIREBASE_VAPID_KEY=BN...optional-for-push

# ========== FEATURE FLAGS (client) ==========
VITE_FEATURE_AI_INSIGHTS=true
VITE_FEATURE_COMMUNITY_POOL=true
VITE_FEATURE_LEADERBOARD=true

# ========== ADMIN (comma-separated emails; client + functions) ==========
VITE_ADMIN_EMAILS=you@example.com,admin@driiva.co.uk

# ========== SENTRY (optional) ==========
VITE_SENTRY_DSN=https://...@sentry.io/...
VITE_APP_VERSION=1.0.0

# ========== STRIPE (optional; for checkout) ==========
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_... or pk_live_...

# ========== SERVER / API (Vercel + local; NOT VITE_) ==========
# Database (Neon PostgreSQL) — required for server
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# CORS — include your production URL
CORS_ORIGINS=https://app.driiva.co.uk,http://localhost:5173,http://localhost:3001

# WebAuthn (use production domain in prod)
WEBAUTHN_RP_ID=app.driiva.co.uk
WEBAUTHN_ORIGIN=https://app.driiva.co.uk

# Firebase Admin — server-side token verification (pick one)
# Option A: JSON string (e.g. in Vercel env)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"driiva",...}
# Option B: Path to key file (local only)
# GOOGLE_APPLICATION_CREDENTIALS=./path/to/service-account.json

# If no service account, server can still verify tokens via REST using API key
# (VITE_FIREBASE_API_KEY is read by server as fallback if FIREBASE_API_KEY not set)

# Admin list (server); can match VITE_ADMIN_EMAILS
ADMIN_EMAILS=you@example.com,admin@driiva.co.uk
ADMIN_FIREBASE_UIDS=uid1,uid2

# Optional
ENCRYPTION_KEY=32-byte-hex-or-base64
ANTHROPIC_API_KEY=sk-ant-...
SENTRY_DSN_FUNCTIONS=
ROOT_API_KEY=
ROOT_API_URL=https://api.rootplatform.com/v1/insurance
ROOT_ENVIRONMENT=sandbox
ROOT_PRODUCT_MODULE_KEY=
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRODUCT_ID=
STRIPE_MONTHLY_PRICE_ID=
AI_COACH_PROVIDER=perplexity
AI_COACH_API_KEY=
PERPLEXITY_API_KEY=
ROOT_WEBHOOK_SECRET=
CLASSIFIER_URL=
DAMOOV_INSTANCE_ID=
DAMOOV_INSTANCE_KEY=
```

---

## 3. What “100%” means for Firebase to work

- **Client (browser):**  
  These three must be set and non-empty, or the app runs in demo mode and real auth won’t work:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`

- **Firebase Console:**  
  - Authorized domains include your app URL (e.g. `app.driiva.co.uk` and `localhost`).  
  - Email/Password (and Google if you use it) sign-in methods enabled.

- **Server (Express on Vercel):**  
  So the API can verify Firebase tokens:
  - Either `FIREBASE_SERVICE_ACCOUNT_KEY` (full JSON string), or  
  - `GOOGLE_APPLICATION_CREDENTIALS` (local file path), or  
  - At least `VITE_FIREBASE_API_KEY` (or `FIREBASE_API_KEY`) so the server can use the REST fallback.

---

## 4. Vercel: which env vars to add

- Add **every variable** from the block above that you use (same names and values).
- **Important:** All `VITE_*` variables must be set in Vercel and apply to **Production** (and Preview if you want). They are baked in at **build** time; changing them later requires a redeploy.
- For Production, set:
  - All `VITE_*` (Firebase, feature flags, Stripe publishable, Sentry DSN, admin emails).
  - `DATABASE_URL`, `CORS_ORIGINS`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `FIREBASE_SERVICE_ACCOUNT_KEY` (or API key fallback), `ADMIN_EMAILS` / `ADMIN_FIREBASE_UIDS`, and any optional keys you use.

So: **one link for users** = `https://app.driiva.co.uk`. **100% env/Firebase** = the list above + Firebase Console steps (authorized domains, sign-in methods, and config from Project settings).
