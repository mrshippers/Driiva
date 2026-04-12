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

async function readAdminFlagFromFirestore(uid: string, email?: string): Promise<boolean> {
  // Env-var allowlist takes precedence — no Firestore doc required
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
      // Do NOT call setLoading(false) here for the Firebase-configured path.
      // onAuthStateChanged is the single source of truth for loading state.
      // Calling it here creates a race: loading=false before user is resolved,
      // causing ProtectedRoute to redirect to /signin mid-auth.
    }

    initAuth();

    // Guard: only subscribe to auth state if Firebase Auth is initialized
    if (!auth) {
      console.warn('[AuthContext] Firebase Auth not initialized — skipping onAuthStateChanged listener');
      setLoading(false);
      return () => {}; // no-op cleanup
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        sessionStorage.removeItem('driiva-demo-mode');
        sessionStorage.removeItem('driiva-demo-user');

        // ── FAST PATH ────────────────────────────────────────────────────────
        // Resolve auth from Firestore immediately (<500ms) so ProtectedRoutes
        // and the onboarding check unblock without waiting for the Neon/API round-trip.
        // The slow path (reload + API fetch) runs in the background and patches
        // the user state once the Neon cold-start resolves.
        try {
          const [onboardingComplete, adminFlag] = await Promise.all([
            readOnboardingFromFirestore(firebaseUser.uid),
            readAdminFlagFromFirestore(firebaseUser.uid, firebaseUser.email ?? undefined),
          ]);
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? "",
            name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
            onboardingComplete,
            emailVerified: firebaseUser.emailVerified,
            isAdmin: adminFlag,
          });
          setSentryUser({ id: firebaseUser.uid, email: firebaseUser.email ?? undefined });
        } catch {
          // Firestore read failed — still unblock with minimal Firebase data
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? "",
            name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
            onboardingComplete: false,
            emailVerified: firebaseUser.emailVerified,
            isAdmin: false,
          });
        }
        setLoading(false); // ← unblock routes NOW, before Neon warms up

        // ── SLOW PATH (background) ────────────────────────────────────────────
        // Enrich with fresh emailVerified + Neon profile data.
        // Failures here are silent — user is already navigating.
        (async () => {
          try {
            await Promise.race([
              firebaseUser.reload(),
              new Promise<void>((_, reject) => setTimeout(() => reject(), 5000)),
            ]).catch(() => {});
            const refreshedUser = auth!.currentUser ?? firebaseUser;

            const token = await Promise.race([
              refreshedUser.getIdToken(),
              new Promise<never>((_, reject) => setTimeout(() => reject(), 5000)),
            ]);

            const controller = new AbortController();
            const fetchTimeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch("/api/profile/me", {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "include",
              signal: controller.signal,
            }).catch(() => null as Response | null).finally(() => clearTimeout(fetchTimeoutId));

            if (res?.ok) {
              const profile = await res.json();
              setUser(prev => prev ? {
                ...prev,
                email: profile.email ?? prev.email,
                name: profile.name ?? prev.name,
                onboardingComplete: profile.onboardingComplete === true,
                emailVerified: refreshedUser.emailVerified,
              } : prev);
              setSentryUser({ id: refreshedUser.uid, email: refreshedUser.email ?? undefined });
            } else {
              // API unavailable — at least patch emailVerified from the reload
              setUser(prev => prev ? { ...prev, emailVerified: (auth?.currentUser ?? firebaseUser).emailVerified } : prev);
            }
          } catch {
            // Background enrichment failed — fast-path data is sufficient
          }
        })();
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
    // Set loading=true so ProtectedRoute shows a spinner (not a blank page) during the
    // sign-out / re-auth gap. onAuthStateChanged(null) will call setLoading(false).
    setLoading(true);
    // Clear user from state FIRST for instant UI feedback
    setUser(null);
    setSentryUser(null);

    // Clear all localStorage flags
    sessionStorage.removeItem('driiva-demo-mode');
    sessionStorage.removeItem('driiva-demo-user');
    localStorage.removeItem('driiva-auth-token');

    // Firebase signOut in background (non-blocking for UX)
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
