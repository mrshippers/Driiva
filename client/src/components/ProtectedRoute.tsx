import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
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

// Same env-var allowlist as AuthContext — for instant admin detection without waiting for Firestore.
const ADMIN_EMAILS_ENV = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * PROTECTED ROUTE COMPONENT
 * =========================
 * Guards routes that require authentication.
 *
 * Flow:
 *   1. AuthContext loading → branded loader (no white flash, no premature redirects)
 *   2. Demo mode → allow immediately
 *   3. No user → redirect to /signin
 *   4. Admin check: if admin status is still resolving (isAdmin undefined, but user
 *      exists), wait briefly before enforcing email/onboarding checks. This prevents
 *      the verify-email redirect loop for admin users.
 *   5. Email not verified (unless skipEmailVerificationCheck or admin) → redirect to /verify-email
 *   6. Onboarding not complete (unless skipOnboardingCheck or admin) → redirect to /quick-onboarding
 *   7. All checks pass → render children
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

  // Check admin status synchronously from env var (instant) or from user object.
  const isAdminByEnv = user?.email ? ADMIN_EMAILS_ENV.includes(user.email.toLowerCase()) : false;
  const isAdmin = user?.isAdmin === true || isAdminByEnv;

  // If user exists but isAdmin is still undefined (background enrichment pending)
  // and the email isn't in the env-var allowlist, wait briefly before enforcing
  // email verification. This prevents the verify-email loop for Firestore-based admins.
  const [adminGraceExpired, setAdminGraceExpired] = useState(false);
  useEffect(() => {
    if (!user || isAdmin || user.isAdmin !== undefined) {
      setAdminGraceExpired(true); // No need to wait
      return;
    }
    // isAdmin is undefined — enrichment in progress. Wait up to 2s.
    const t = setTimeout(() => setAdminGraceExpired(true), 2000);
    return () => clearTimeout(t);
  }, [user, isAdmin, user?.isAdmin]);

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

    // Don't redirect until admin grace period expires (prevents verify-email loop)
    if (!adminGraceExpired) return;

    if (shouldEnforceEmailVerification && user.emailVerified === false) {
      hasRedirected.current = true;
      setLocation('/verify-email');
      return;
    }

    // Only enforce onboarding if the field has been resolved (not undefined)
    if (shouldEnforceOnboarding && user.onboardingComplete === false) {
      hasRedirected.current = true;
      setLocation('/quick-onboarding');
    }
  }, [loading, user, isDemoMode, shouldEnforceOnboarding, shouldEnforceEmailVerification, adminGraceExpired, setLocation]);

  // AuthProvider still bootstrapping
  if (loading) return <BrandedLoader />;

  if (isDemoMode) return <>{children}</>;

  if (!user) return <BrandedLoader />;

  // Waiting for admin grace period before deciding on email verification
  if (!adminGraceExpired && !isAdmin && user.emailVerified === false) return <BrandedLoader />;

  if (shouldEnforceEmailVerification && user.emailVerified === false) return <BrandedLoader />;
  // Only block on onboarding if the field is explicitly false (not undefined)
  if (shouldEnforceOnboarding && user.onboardingComplete === false) return <BrandedLoader />;

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
