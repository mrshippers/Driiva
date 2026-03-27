import React, { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import BrandedLoader from '@/components/BrandedLoader';

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
 *   1. AuthContext loading → branded loader (no white flash, no premature redirects)
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

  // Admin users and users who clicked "Skip for now" bypass email verification.
  const skipEmailTemp =
    typeof window !== 'undefined' &&
    sessionStorage.getItem('driiva-skip-email-verification') === 'true';

  // Admins are internal users — they skip both email verification AND onboarding.
  const isAdmin = user?.isAdmin === true;
  const shouldEnforceEmailVerification =
    !skipEmailVerificationCheck && !skipEmailTemp && !isAdmin;
  const shouldEnforceOnboarding = !skipOnboardingCheck && !isAdmin;

  useLayoutEffect(() => {
    if (loading) return;
    if (hasRedirected.current) return;
    if (isDemoMode) return;

    if (!user) {
      hasRedirected.current = true;
      setLocation('/signin');
      return;
    }

    if (shouldEnforceEmailVerification && user.emailVerified === false) {
      hasRedirected.current = true;
      setLocation('/verify-email');
      return;
    }

    if (shouldEnforceOnboarding && user.onboardingComplete !== true) {
      hasRedirected.current = true;
      setLocation('/quick-onboarding');
    }
  }, [loading, user, isDemoMode, shouldEnforceOnboarding, shouldEnforceEmailVerification, setLocation]);

  // AuthProvider still bootstrapping — show branded loader to prevent white flash
  // and ensure emailVerified is fresh (reload() completes before loading=false)
  if (loading) return <BrandedLoader />;

  if (isDemoMode) return <>{children}</>;

  // Not authenticated / email unverified / onboarding incomplete → branded loader
  // while the useLayoutEffect redirect fires (avoids blank/white flash)
  if (!user) return <BrandedLoader />;
  if (shouldEnforceEmailVerification && user.emailVerified === false) return <BrandedLoader />;
  if (shouldEnforceOnboarding && user.onboardingComplete !== true) return <BrandedLoader />;

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

  // Authenticated real user — branded loader while redirect fires
  if (user) return <BrandedLoader />;

  return <>{children}</>;
};
