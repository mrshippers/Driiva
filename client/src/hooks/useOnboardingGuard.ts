/**
 * ONBOARDING GUARD HOOK
 * =====================
 * Hook to check if user has completed onboarding.
 * Redirects to /onboarding if not completed.
 * 
 * Usage:
 *   const { isReady, needsOnboarding } = useOnboardingGuard();
 *   if (!isReady) return <Loading />;
 *   // Component renders only when ready
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { getDocWithRetry } from '@/lib/firestoreRetry';
import { useAuth } from '@/contexts/AuthContext';

export interface OnboardingGuardResult {
  /** True when the check is complete and component can render */
  isReady: boolean;
  /** True if user needs to complete onboarding */
  needsOnboarding: boolean;
  /** True if user is authenticated */
  isAuthenticated: boolean;
  /** Current user's onboarding status */
  onboardingCompleted: boolean;
  /** Loading state */
  loading: boolean;
}

export function useOnboardingGuard(
  options: {
    /** If true, automatically redirect to /onboarding when needed */
    autoRedirect?: boolean;
    /** Routes to skip onboarding check (e.g., ['/onboarding', '/quick-onboarding']) */
    skipRoutes?: string[];
  } = {}
): OnboardingGuardResult {
  const { autoRedirect = true, skipRoutes = ['/onboarding', '/quick-onboarding'] } = options;
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  
  const [isReady, setIsReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip check for certain routes
    if (skipRoutes.includes(location)) {
      setIsReady(true);
      setLoading(false);
      return;
    }

    // Check demo mode
    const isDemoMode = localStorage.getItem('driiva-demo-mode') === 'true';
    if (isDemoMode) {
      setIsAuthenticated(true);
      setOnboardingCompleted(true);
      setNeedsOnboarding(false);
      setIsReady(true);
      setLoading(false);
      return;
    }

    // If user from context, use that
    if (user) {
      setIsAuthenticated(true);
      const completed = user.onboardingComplete === true;
      setOnboardingCompleted(completed);
      setNeedsOnboarding(!completed);
      
      if (!completed && autoRedirect) {
        setLocation('/quick-onboarding');
      }
      
      setIsReady(completed || !autoRedirect);
      setLoading(false);
      return;
    }

    // If no Firebase, skip check
    if (!isFirebaseConfigured || !auth) {
      setIsReady(true);
      setLoading(false);
      return;
    }

    // Listen for auth state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setIsAuthenticated(false);
        setOnboardingCompleted(false);
        setNeedsOnboarding(false);
        setIsReady(true);
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);

      try {
        // Check Firestore for onboarding status
        if (!db) throw new Error('Firestore not initialized');
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDocWithRetry(userDocRef);
        const userData = userDoc.data();

        const completed = userData?.onboardingCompleted === true || userData?.onboardingComplete === true;
        setOnboardingCompleted(completed);
        setNeedsOnboarding(!completed);

        if (!completed && autoRedirect) {
          setLocation('/quick-onboarding');
          setIsReady(false);
        } else {
          setIsReady(true);
        }
      } catch (error) {
        console.error('[useOnboardingGuard] Error checking onboarding status:', error);
        // On error, assume onboarding needed for new users
        setNeedsOnboarding(true);
        if (autoRedirect) {
          setLocation('/quick-onboarding');
        }
        setIsReady(!autoRedirect);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user, location, autoRedirect, skipRoutes, setLocation]);

  return {
    isReady,
    needsOnboarding,
    isAuthenticated,
    onboardingCompleted,
    loading,
  };
}

export default useOnboardingGuard;
