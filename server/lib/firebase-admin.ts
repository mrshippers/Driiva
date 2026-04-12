/**
 * Firebase token verification — two paths, no service account key required.
 *
 * Path 1 (preferred): Firebase Admin SDK, used when GOOGLE_APPLICATION_CREDENTIALS
 *   or FIREBASE_SERVICE_ACCOUNT_KEY is present (service account JSON).
 *
 * Path 2 (fallback): Firebase Identity Toolkit REST API — verifies the ID token by
 *   calling the public `accounts:lookup` endpoint. Only requires VITE_FIREBASE_API_KEY,
 *   which is already in .env. Works even when org policy blocks service account key creation.
 */

import * as admin from "firebase-admin";

let adminApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App | null {
  if (adminApp) return adminApp;
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      adminApp = admin.initializeApp({ credential: admin.credential.applicationDefault() });
      return adminApp;
    }
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (key) {
      const parsed = JSON.parse(key) as admin.ServiceAccount;
      adminApp = admin.initializeApp({ credential: admin.credential.cert(parsed) });
      return adminApp;
    }
  } catch (e) {
    console.warn("[firebase-admin] Admin SDK not initialized:", (e as Error).message);
  }
  return null;
}

/**
 * Verify a Firebase ID token via the Identity Toolkit REST API.
 * No service account needed — uses the public Firebase API key.
 * Node 20's built-in fetch is used (no extra deps).
 */
async function verifyViaRestApi(idToken: string): Promise<{ uid: string; email?: string } | null> {
  const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as { users?: { localId: string; email?: string }[] };
    const user = data.users?.[0];
    if (!user) return null;
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

export async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  const firebase = getFirebaseAdmin();
  if (firebase) {
    try {
      const decoded = await firebase.auth().verifyIdToken(idToken);
      return { uid: decoded.uid, email: decoded.email };
    } catch {
      return null;
    }
  }

  // In production, require the Admin SDK — the REST fallback does not verify JWT signatures.
  if (process.env.NODE_ENV === "production") {
    console.error("[firebase-admin] CRITICAL: Admin SDK not initialised in production. Set FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS.");
    return null;
  }

  // Development-only fallback: REST API (does not cryptographically verify the JWT)
  return verifyViaRestApi(idToken);
}
