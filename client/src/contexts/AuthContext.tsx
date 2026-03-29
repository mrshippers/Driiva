import React, { createContext, useContext, useState, useEffect, useRef } from "react";
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

// ─── LocalStorage auth cache ────────────────────────────────────────────────
// Lets us render immediately on return visits without waiting for Firebase SDK.
const AUTH_CACHE_KEY = 'driiva-auth-cache';

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic sanity check
    if (parsed && parsed.id && parsed.email) return parsed as User;
  } catch { /* corrupt cache */ }
  return null;
}

function setCachedUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch { /* quota / private browsing */ }
}

// ─── Admin helpers ──────────────────────────────────────────────────────────
const ADMIN_EMAILS_ENV = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS_ENV.includes(email.toLowerCase());
}

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

async function readAdminFlagFromFirestore(uid: string, email?: string): Promise<boolean> {
  if (email && ADMIN_EMAILS_ENV.includes(email.toLowerCase())) return true;
  if (!db) return false;
  try {
    const userSnap = await getDocWithRetry(doc(db, 'users', uid));
    if (userSnap.exists()) {
      return userSnap.data()?.isAdmin === true;
    }
  } catch { /* Non-critical */ }
  return false;
}

// ─── Maximum time (ms) loading can stay true ────────────────────────────────
const LOADING_HARD_TIMEOUT_MS = 3000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Hydrate from cache immediately — no waiting for Firebase SDK
  const cachedUser = useRef(getCachedUser());
  const [user, setUserState] = useState<User | null>(cachedUser.current);
  // If we have a cached user, we don't need to block rendering
  const [loading, setLoading] = useState(!cachedUser.current);

  // Wrapper that also updates the cache
  const setUser = (u: User | null) => {
    setUserState(u);
    setCachedUser(u);
  };

  useEffect(() => {
    // ── Hard timeout: never block the UI for more than 3s ──
    let hardTimeout: ReturnType<typeof setTimeout> | undefined;
    if (loading) {
      hardTimeout = setTimeout(() => {
        setLoading(false);
      }, LOADING_HARD_TIMEOUT_MS);
    }

    // ── Demo mode ──
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
    } catch { /* sessionStorage unavailable */ }

    if (!isFirebaseConfigured) {
      setLoading(false);
      return () => { if (hardTimeout) clearTimeout(hardTimeout); };
    }

    if (!auth) {
      setLoading(false);
      return () => { if (hardTimeout) clearTimeout(hardTimeout); };
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      // Clear hard timeout — we got a real response
      if (hardTimeout) { clearTimeout(hardTimeout); hardTimeout = undefined; }

      if (firebaseUser) {
        sessionStorage.removeItem('driiva-demo-mode');
        sessionStorage.removeItem('driiva-demo-user');

        // ── FAST PATH: render immediately with what we have ──
        const quickAdmin = isAdminEmail(firebaseUser.email);
        const fastUser: User = {
          id: firebaseUser.uid,
          email: firebaseUser.email ?? "",
          name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
          emailVerified: firebaseUser.emailVerified,
          isAdmin: quickAdmin || undefined,
          // Use cached onboardingComplete if available, otherwise undefined
          onboardingComplete: cachedUser.current?.id === firebaseUser.uid
            ? cachedUser.current.onboardingComplete
            : undefined,
        };
        setUser(fastUser);
        setLoading(false);

        // ── BACKGROUND ENRICHMENT ──
        // Everything below runs after the UI is already interactive.
        try {
          // Parallelize: token fetch + admin flag + onboarding status
          // Skip firebaseUser.reload() — it's slow and only needed for emailVerified refresh
          const enrichPromise = Promise.all([
            firebaseUser.getIdToken().catch(() => null as string | null),
            readAdminFlagFromFirestore(firebaseUser.uid, firebaseUser.email ?? undefined),
            readOnboardingFromFirestore(firebaseUser.uid),
          ]);

          // 4s hard timeout on enrichment — if it doesn't complete, use what we have
          const enrichTimeout = new Promise<[string | null, boolean, boolean]>((resolve) =>
            setTimeout(() => resolve([null, quickAdmin, fastUser.onboardingComplete ?? false]), 4000)
          );

          const [token, adminFlag, onboardingDirect] = await Promise.race([enrichPromise, enrichTimeout]);

          // Try API profile (1.5s timeout — it's optional, Firestore is the source of truth)
          let profileOnboarding: boolean | null = null;
          if (token) {
            try {
              const controller = new AbortController();
              const fetchTimeout = setTimeout(() => controller.abort(), 1500);
              const res = await fetch("/api/profile/me", {
                headers: { Authorization: `Bearer ${token}` },
                credentials: "include",
                signal: controller.signal,
              });
              clearTimeout(fetchTimeout);
              if (res.ok) {
                const profile = await res.json();
                profileOnboarding = profile.onboardingComplete === true;
              }
            } catch { /* API unavailable — use Firestore result */ }
          }

          const onboardingComplete = profileOnboarding ?? onboardingDirect;

          // Refresh emailVerified from currentUser (may have updated via getIdToken)
          const currentUser = auth!.currentUser ?? firebaseUser;

          const enrichedUser: User = {
            id: currentUser.uid,
            email: currentUser.email ?? "",
            name: currentUser.displayName ?? currentUser.email?.split("@")[0] ?? "User",
            onboardingComplete,
            emailVerified: currentUser.emailVerified,
            isAdmin: adminFlag,
          };
          setUser(enrichedUser);
          setSentryUser({ id: currentUser.uid, email: currentUser.email ?? undefined });
        } catch (error) {
          console.error("[AuthContext] Enrichment error:", error);
          // Fallback: try Firestore directly
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
          } catch { /* Give up enrichment — fast path user is already set */ }
        }
      } else {
        // No user — clear cache and state
        const demoModeActive = sessionStorage.getItem("driiva-demo-mode") === "true";
        if (!demoModeActive) {
          setUser(null);
          setSentryUser(null);
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (hardTimeout) clearTimeout(hardTimeout);
    };
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
    setUserState(u => {
      const updated = u ? { ...u, emailVerified: true } : null;
      setCachedUser(updated);
      return updated;
    });
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
