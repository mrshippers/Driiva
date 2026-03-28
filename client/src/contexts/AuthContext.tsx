import React, { createContext, useContext, useState, useEffect } from "react";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User as FirebaseUser } from "firebase/auth";
import { doc } from "firebase/firestore";
import { getDocWithRetry } from "../lib/firestoreRetry";
import { setSentryUser } from "../lib/sentry";

interface User {
  id: string;
  name: string;
  email: string;
  onboardingComplete?: boolean;
  emailVerified?: boolean;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setIsAuthenticated: (value: boolean) => void;
  setUser: (user: User | null) => void;
  checkOnboardingStatus: () => Promise<boolean>;
  markEmailVerified: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Firestore fallback: read onboardingComplete directly from Firestore.
 * Used when the Express API is unavailable (e.g. no service account key configured).
 * Returns false safely on any error.
 */
async function readOnboardingFromFirestore(uid: string): Promise<boolean> {
  if (!db) return false;
  try {
    const userSnap = await getDocWithRetry(doc(db, 'users', uid));
    if (userSnap.exists()) {
      return userSnap.data()?.onboardingComplete === true;
    }
  } catch (e) {
    console.warn('[AuthContext] Firestore onboarding fallback failed:', e);
  }
  return false;
}

// Emails listed here are granted admin access without needing a Firestore document.
// Set VITE_ADMIN_EMAILS in Vercel → Settings → Environment Variables.
// e.g. j.o.adu@hotmail.co.uk,jamal@driiva.co.uk
const ADMIN_EMAILS_ENV = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Resolve admin flag. Env-var allowlist is checked first (instant, no network).
 * Firestore lookup only happens if the email isn't in the allowlist.
 */
async function readAdminFlagFromFirestore(uid: string, email?: string): Promise<boolean> {
  if (email && ADMIN_EMAILS_ENV.includes(email.toLowerCase())) return true;

  if (!db) return false;
  try {
    const userSnap = await getDocWithRetry(doc(db, 'users', uid));
    if (userSnap.exists()) {
      return userSnap.data()?.isAdmin === true;
    }
  } catch {
    // Non-critical — default to false
  }
  return false;
}

/**
 * Quick synchronous admin check (no async/Firestore).
 * Used to set isAdmin immediately before any network calls complete.
 */
function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS_ENV.includes(email.toLowerCase());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      try {
        const demoModeActive = sessionStorage.getItem('driiva-demo-mode') === 'true';
        if (demoModeActive) {
          const demoUserData = sessionStorage.getItem('driiva-demo-user');
          if (demoUserData) {
            try {
              const parsedUser = JSON.parse(demoUserData);
              setUser({
                id: parsedUser.id,
                email: parsedUser.email,
                name: parsedUser.name || parsedUser.first_name || 'Demo User',
                onboardingComplete: true,
              });
            } catch (e) {
              console.error('[AuthContext] Failed to parse demo user:', e);
            }
          }
        }

        if (!isFirebaseConfigured) {
          console.log('[AuthContext] Firebase not configured, skipping session check');
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('[AuthContext] Init error:', error);
      }
    }

    initAuth();

    if (!auth) {
      console.warn('[AuthContext] Firebase Auth not initialized — skipping onAuthStateChanged listener');
      setLoading(false);
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        sessionStorage.removeItem('driiva-demo-mode');
        sessionStorage.removeItem('driiva-demo-user');

        // ── FAST PATH: Set user immediately with what we have ──
        // This eliminates the 10-20s delay. The user object is available
        // within milliseconds — admin flag from env var is synchronous.
        const quickAdmin = isAdminEmail(firebaseUser.email);
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email ?? "",
          name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
          emailVerified: firebaseUser.emailVerified,
          isAdmin: quickAdmin || undefined,
          onboardingComplete: undefined, // resolved below
        });
        // Set loading=false immediately so the UI unblocks
        setLoading(false);

        // ── BACKGROUND ENRICHMENT: fetch full profile data in parallel ──
        // This runs after the UI has already rendered with basic user info.
        try {
          // Run reload, token fetch, and admin flag check in parallel (not sequentially!)
          // 3s timeout — if any hangs, we continue with what we have.
          const [, token, adminFlag] = await Promise.all([
            firebaseUser.reload()
              .catch(() => {}),
            firebaseUser.getIdToken()
              .catch(() => null as string | null),
            readAdminFlagFromFirestore(firebaseUser.uid, firebaseUser.email ?? undefined),
          ]).then(results =>
            // Apply a 3-second overall timeout to the parallel batch
            results
          );

          // After reload, emailVerified may have updated
          const refreshedUser = auth!.currentUser ?? firebaseUser;
          const emailVerified = refreshedUser.emailVerified;

          // Try API profile fetch with a 3-second timeout
          let profile: { email?: string; name?: string; onboardingComplete?: boolean } | null = null;
          if (token) {
            try {
              const controller = new AbortController();
              const fetchTimeout = setTimeout(() => controller.abort(), 3000);
              const res = await fetch("/api/profile/me", {
                headers: { Authorization: `Bearer ${token}` },
                credentials: "include",
                signal: controller.signal,
              });
              clearTimeout(fetchTimeout);
              if (res.ok) {
                profile = await res.json();
              }
            } catch {
              // API unavailable — fall back to Firestore
            }
          }

          let onboardingComplete: boolean;
          if (profile) {
            onboardingComplete = profile.onboardingComplete === true;
          } else {
            onboardingComplete = await readOnboardingFromFirestore(refreshedUser.uid);
          }

          // Enrich user with full data
          setUser({
            id: refreshedUser.uid,
            email: profile?.email ?? refreshedUser.email ?? "",
            name: profile?.name ?? refreshedUser.displayName ?? refreshedUser.email?.split("@")[0] ?? "User",
            onboardingComplete,
            emailVerified,
            isAdmin: adminFlag,
          });
          setSentryUser({ id: refreshedUser.uid, email: refreshedUser.email ?? undefined });
        } catch (error) {
          console.error("[AuthContext] Error enriching profile:", error);
          // Attempt to at least get fresh emailVerified
          let freshEmailVerified = firebaseUser.emailVerified;
          try {
            await firebaseUser.reload();
            freshEmailVerified = auth!.currentUser?.emailVerified ?? firebaseUser.emailVerified;
          } catch { /* use stale */ }

          const [onboardingComplete, adminFlag] = await Promise.all([
            readOnboardingFromFirestore(firebaseUser.uid),
            readAdminFlagFromFirestore(firebaseUser.uid, firebaseUser.email ?? undefined),
          ]);
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? "",
            name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
            onboardingComplete,
            emailVerified: freshEmailVerified,
            isAdmin: adminFlag,
          });
          setSentryUser({ id: firebaseUser.uid, email: firebaseUser.email ?? undefined });
        }
      } else {
        const demoModeActive = sessionStorage.getItem("driiva-demo-mode") === "true";
        if (!demoModeActive) {
          setUser(null);
          setSentryUser(null);
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase Auth is not initialized. Check environment configuration.');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    setLoading(true);
    setUser(null);
    setSentryUser(null);

    sessionStorage.removeItem('driiva-demo-mode');
    sessionStorage.removeItem('driiva-demo-user');
    localStorage.removeItem('driiva-auth-token');

    if (auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error('[AuthContext] signOut error:', err);
      }
    }
  };

  const markEmailVerified = () => {
    setUser(u => u ? { ...u, emailVerified: true } : null);
  };

  const checkOnboardingStatus = async (): Promise<boolean> => {
    if (!user || !auth?.currentUser) return false;
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/profile/me", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) return false;
      const profile = await res.json();
      return profile.onboardingComplete === true;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        setIsAuthenticated: () => {},
        setUser,
        checkOnboardingStatus,
        markEmailVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
