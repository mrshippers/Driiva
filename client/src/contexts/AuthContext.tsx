import React, { createContext, useContext, useState, useEffect } from "react";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User as FirebaseUser } from "firebase/auth";
import { doc } from "firebase/firestore";
import { getDocWithRetry } from "../lib/firestoreRetry";

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

async function readAdminFlagFromFirestore(uid: string): Promise<boolean> {
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
        const demoModeActive = localStorage.getItem('driiva-demo-mode') === 'true';
        if (demoModeActive) {
          const demoUserData = localStorage.getItem('driiva-demo-user');
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
      setLoading(false);
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
        // Real Firebase user: always clear demo mode so real account and onboarding flow take over
        localStorage.removeItem('driiva-demo-mode');
        localStorage.removeItem('driiva-demo-user');
        try {
          const token = await firebaseUser.getIdToken();
          const res = await fetch("/api/profile/me", {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          });
          if (res.ok) {
            const profile = await res.json();
            const adminFlag = await readAdminFlagFromFirestore(firebaseUser.uid);
            setUser({
              id: firebaseUser.uid,
              email: profile.email ?? firebaseUser.email ?? "",
              name: profile.name ?? firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
              onboardingComplete: profile.onboardingComplete === true,
              emailVerified: firebaseUser.emailVerified,
              isAdmin: adminFlag,
            });
          } else {
            // API unavailable (e.g. no service account key configured) — fall back to Firestore
            const [onboardingComplete, adminFlag] = await Promise.all([
              readOnboardingFromFirestore(firebaseUser.uid),
              readAdminFlagFromFirestore(firebaseUser.uid),
            ]);
            setUser({
              id: firebaseUser.uid,
              email: firebaseUser.email ?? "",
              name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
              onboardingComplete,
              emailVerified: firebaseUser.emailVerified,
              isAdmin: adminFlag,
            });
          }
        } catch (error) {
          console.error("[AuthContext] Error fetching profile from API:", error);
          // Fall back to Firestore instead of defaulting to onboardingComplete: false
          const [onboardingComplete, adminFlag] = await Promise.all([
            readOnboardingFromFirestore(firebaseUser.uid),
            readAdminFlagFromFirestore(firebaseUser.uid),
          ]);
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? "",
            name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
            onboardingComplete,
            emailVerified: firebaseUser.emailVerified,
            isAdmin: adminFlag,
          });
        }
      } else {
        const demoModeActive = localStorage.getItem("driiva-demo-mode") === "true";
        if (!demoModeActive) {
          setUser(null);
        }
      }
      setLoading(false);
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

    // Clear all localStorage flags
    localStorage.removeItem('driiva-demo-mode');
    localStorage.removeItem('driiva-demo-user');
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
