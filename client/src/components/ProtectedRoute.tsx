import React, { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If true, skip onboarding check (for onboarding pages themselves) */
  skipOnboardingCheck?: boolean;
  /** If true, skip email verification check (used for /quick-onboarding so new users can complete setup first) */
  skipEmailVerificationCheck?: boolean;
}

/**
 * PROTECTED ROUTE COMPONENT
 * =========================
 * Guards routes that require authentication.
 *
 * Flow:
 *   1. AuthContext loading → spinner
 *   2. Demo mode → allow immediately
 *   3. No user → redirect to /signin
 *   4. Email not verified (unless skipEmailVerificationCheck) → redirect to /verify-email
 *   5. Onboarding not complete (unless skipOnboardingCheck) → redirect to /quick-onboarding
 *   6. All checks pass → render children
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  skipOnboardingCheck = false,
  skipEmailVerificationCheck = false,
}) => {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const hasRedirected = useRef(false);

  const isDemoMode = typeof window !== 'undefined' && sessionStorage.getItem('driiva-demo-mode') === 'true';

  useLayoutEffect(() => {
    if (loading) return;
    if (hasRedirected.current) return;
    if (isDemoMode) return;

    if (!user) {
      hasRedirected.current = true;
      setLocation('/signin');
      return;
    }

    if (!skipEmailVerificationCheck && user.emailVerified === false) {
      hasRedirected.current = true;
      setLocation('/verify-email');
      return;
    }

    if (!skipOnboardingCheck && user.onboardingComplete !== true) {
      hasRedirected.current = true;
      setLocation('/quick-onboarding');
    }
  }, [loading, user, isDemoMode, skipOnboardingCheck, skipEmailVerificationCheck, setLocation]);

  // AuthProvider still bootstrapping
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (isDemoMode) return <>{children}</>;

  // Not authenticated → spinner while redirect fires
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Email not verified → spinner while redirect fires
  if (!skipEmailVerificationCheck && user.emailVerified === false) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Onboarding not completed → spinner while redirect fires
  if (!skipOnboardingCheck && user.onboardingComplete !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
};

interface PublicOnlyRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * PUBLIC ONLY ROUTE
 * =================
 * Redirects authenticated users away from auth pages (signin, signup).
 * Demo mode does NOT count — users should be able to create real accounts from demo.
 *
 * PERFORMANCE FIX (v2): useLayoutEffect for zero-flicker redirects.
 */
export const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ 
  children, 
  redirectTo = '/dashboard' 
}) => {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();

  const isDemoMode = typeof window !== 'undefined' && sessionStorage.getItem('driiva-demo-mode') === 'true';

  useLayoutEffect(() => {
    if (loading) return;
    if (isDemoMode) return;
    if (user) {
      setLocation(redirectTo);
    }
  }, [loading, user, setLocation, redirectTo, isDemoMode]);

  // While auth is loading, show content immediately (no spinner for public pages)
  if (loading) return <>{children}</>;

  // Demo mode — always show auth pages (so user can create real account)
  if (isDemoMode) return <>{children}</>;

  // Authenticated real user — show spinner while redirect fires in useLayoutEffect
  // (null caused a blank-page flash identical to the ProtectedRoute case)
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
};
