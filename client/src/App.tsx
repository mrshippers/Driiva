import React, { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Router, Route, Switch, Redirect } from 'wouter';
import gradientBackground from './assets/gradient-background.png';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import { HomeRedirect } from './components/HomeRedirect';

// ─── Eagerly loaded: critical user journey pages ─────────────────────────
// These are loaded in the initial bundle so navigation is instant.
import Welcome from './pages/welcome';
import Signup from './pages/signup';
import SignIn from './pages/signin';
import Demo from './pages/demo';
import QuickOnboarding from './pages/quick-onboarding';
import Dashboard from './pages/dashboard';
import Trips from './pages/trips';
import Profile from './pages/profile';
import Settings from './pages/settings';

// ─── Lazy-loaded: secondary pages (split into separate chunks) ───────────
const Permissions = lazy(() => import('./pages/permissions'));
const Onboarding = lazy(() => import('./pages/onboarding'));
const CheckoutPage = lazy(() => import('./pages/checkout'));
const Rewards = lazy(() => import('./pages/rewards'));
const Support = lazy(() => import('./pages/support'));
const TripRecording = lazy(() => import('./pages/trip-recording'));
const LeaderboardPage = lazy(() => import('./pages/leaderboard'));
const PolicyPage = lazy(() => import('./pages/policy'));
const Terms = lazy(() => import('./pages/terms'));
const Privacy = lazy(() => import('./pages/privacy'));
const TrustPage = lazy(() => import('./pages/trust'));
const Achievements = lazy(() => import('./pages/achievements'));
const TripDetail = lazy(() => import('./pages/trip-detail'));
const ForgotPassword = lazy(() => import('./pages/forgot-password'));
const VerifyEmail = lazy(() => import('./pages/verify-email'));
const AdminFeedback = lazy(() => import('./pages/admin/feedback'));
const AdminOverview = lazy(() => import('./pages/admin/index'));
const AdminUsers = lazy(() => import('./pages/admin/users'));
const AdminTrips = lazy(() => import('./pages/admin/trips'));
const AdminSystem = lazy(() => import('./pages/admin/system'));
const AdminMonitoring = lazy(() => import('./pages/admin/monitoring'));

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OnlineStatusProvider, useOnlineStatusContext } from './contexts/OnlineStatusContext';
import OfflineBanner from './components/OfflineBanner';
import InstallPrompt from './components/InstallPrompt';
import SplashScreen from './components/SplashScreen';
import BrandedLoader from './components/BrandedLoader';

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [timedOut, setTimedOut] = React.useState(false);

  // Give Firestore an extra 3s to resolve isAdmin before deciding access is denied.
  // This prevents a race where loading=false but isAdmin hasn't been fetched yet.
  React.useEffect(() => {
    if (loading || user?.isAdmin) return;
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, [loading, user?.isAdmin]);

  if (loading || (!user?.isAdmin && !timedOut)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }
  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <p className="text-white/60 text-lg mb-2">Access denied</p>
          <p className="text-white/40 text-sm">Your account does not have admin privileges.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Branded loader shown while lazy pages load — matches gradient from SplashScreen */
function PageFallback() {
  return <BrandedLoader />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SplashScreen>
        <Router>
          <AuthProvider>
            <OnlineStatusProvider>
              <AppContent />
            </OnlineStatusProvider>
          </AuthProvider>
        </Router>
      </SplashScreen>
    </QueryClientProvider>
  );
}

function AppContent() {
  const { isOnline } = useOnlineStatusContext();
  const { loading } = useAuth();

  // Block all route rendering until auth state is resolved — prevents white
  // flash and false redirects to /verify-email for already-authenticated users.
  if (loading) return <BrandedLoader />;

  return (
    <div className={`App ${!isOnline ? 'pt-[52px]' : ''}`}>
      <OfflineBanner />
      <InstallPrompt />
      <div
        className="driiva-gradient-bg"
        style={{
          backgroundImage: `url(${gradientBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      />
      <Suspense fallback={<PageFallback />}>
        <Switch>
          {/* Public routes */}
          <Route path="/" component={Welcome} />
          <Route path="/welcome" component={Welcome} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/trust" component={TrustPage} />

          {/* Auth routes - redirect to dashboard if already logged in */}
          <Route path="/signin">
            <PublicOnlyRoute redirectTo="/dashboard">
              <SignIn />
            </PublicOnlyRoute>
          </Route>
          <Route path="/login">
            <PublicOnlyRoute redirectTo="/dashboard">
              <SignIn />
            </PublicOnlyRoute>
          </Route>
          <Route path="/signup">
            <PublicOnlyRoute redirectTo="/dashboard">
              <Signup />
            </PublicOnlyRoute>
          </Route>
          <Route path="/forgot-password">
            <PublicOnlyRoute redirectTo="/dashboard">
              <ForgotPassword />
            </PublicOnlyRoute>
          </Route>

          {/* Semi-protected routes (onboarding flow) */}
          <Route path="/permissions" component={Permissions} />
          <Route path="/onboarding" component={Onboarding} />

          {/* Redirect legacy /home: dashboard if auth/demo, else welcome */}
          <Route path="/home" component={HomeRedirect} />

          {/* Protected routes - require authentication */}
          <Route path="/dashboard">
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          </Route>
          <Route path="/trips/:tripId">
            <ProtectedRoute><TripDetail /></ProtectedRoute>
          </Route>
          <Route path="/trips">
            <ProtectedRoute><Trips /></ProtectedRoute>
          </Route>
          <Route path="/rewards">
            <ProtectedRoute><Rewards /></ProtectedRoute>
          </Route>
          <Route path="/profile">
            <ProtectedRoute><Profile /></ProtectedRoute>
          </Route>
          <Route path="/support" component={Support} />
          <Route path="/trip-recording">
            <ProtectedRoute><TripRecording /></ProtectedRoute>
          </Route>
          <Route path="/leaderboard">
            <ProtectedRoute><LeaderboardPage /></ProtectedRoute>
          </Route>
          <Route path="/policy">
            <ProtectedRoute><PolicyPage /></ProtectedRoute>
          </Route>
          <Route path="/checkout">
            <ProtectedRoute><CheckoutPage /></ProtectedRoute>
          </Route>
          <Route path="/demo" component={Demo} />
          <Route path="/quick-onboarding">
            {/* Skip both checks: new users verify email after onboarding, not before */}
            <ProtectedRoute skipOnboardingCheck skipEmailVerificationCheck><QuickOnboarding /></ProtectedRoute>
          </Route>
          <Route path="/verify-email">
            {/* Accessible to authenticated but unverified users */}
            <ProtectedRoute skipOnboardingCheck skipEmailVerificationCheck><VerifyEmail /></ProtectedRoute>
          </Route>
          <Route path="/settings">
            <ProtectedRoute><Settings /></ProtectedRoute>
          </Route>
          <Route path="/achievements">
            <ProtectedRoute><Achievements /></ProtectedRoute>
          </Route>

          {/* Admin routes */}
          <Route path="/admin/monitoring">
            <ProtectedRoute>
              <AdminRoute><AdminMonitoring /></AdminRoute>
            </ProtectedRoute>
          </Route>
          <Route path="/admin/users">
            <ProtectedRoute>
              <AdminRoute><AdminUsers /></AdminRoute>
            </ProtectedRoute>
          </Route>
          <Route path="/admin/trips">
            <ProtectedRoute>
              <AdminRoute><AdminTrips /></AdminRoute>
            </ProtectedRoute>
          </Route>
          <Route path="/admin/feedback">
            <ProtectedRoute>
              <AdminRoute><AdminFeedback /></AdminRoute>
            </ProtectedRoute>
          </Route>
          <Route path="/admin/system">
            <ProtectedRoute>
              <AdminRoute><AdminSystem /></AdminRoute>
            </ProtectedRoute>
          </Route>
          <Route path="/admin">
            <ProtectedRoute>
              <AdminRoute><AdminOverview /></AdminRoute>
            </ProtectedRoute>
          </Route>

          <Route>{() => <Redirect to="/" />}</Route>
        </Switch>
      </Suspense>
    </div>
  );
}
