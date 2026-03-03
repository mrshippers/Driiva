/**
 * DASHBOARD PAGE
 * ==============
 * Main dashboard with real-time Firestore data.
 * 
 * Features:
 *   - Real-time driving score and stats
 *   - Recent trips list
 *   - Community pool status
 *   - Policy information
 *   - Demo mode support for testing
 */

import { useState, lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { collection, doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { 
  Car, FileText, AlertCircle, TrendingUp, ChevronRight, 
  Bell, ChevronDown, ChevronUp, MapPin, Users, Trophy, Target, 
  Play, Navigation, RefreshCw, Shield, ExternalLink
} from 'lucide-react';
import { PageWrapper } from '../components/PageWrapper';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from "@/contexts/AuthContext";
import MapLoader from '../components/MapLoader';
import { useDashboardData, DashboardData } from '@/hooks/useDashboardData';
import { useCommunityData } from '@/hooks/useCommunityData';
import { useBetaEstimate } from '@/hooks/useBetaEstimate';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';
import { BetaEstimateCard } from '@/components/BetaEstimateCard';
import ScoreRing from '@/components/ScoreRing';
import { FinancialPromotionDisclaimer } from '@/components/FinancialPromotionDisclaimer';
import { container, item } from '@/lib/animations';

const LeafletMap = lazy(() => import('../components/LeafletMap'));

// ============================================================================
// TYPES
// ============================================================================

interface DemoUser {
  id: string;
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  premium_amount?: number;
  premiumAmount?: number;
  personal_score?: number;
  community_score?: number;
  overall_score?: number;
  drivingScore?: number;
  totalMiles?: number;
  projectedRefund?: number;
  trips?: Array<{
    id: number;
    from: string;
    to: string;
    score: number;
    distance: number;
    date: string;
  }>;
  poolTotal?: number;
  poolShare?: number;
  safetyFactor?: number;
}

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

function ScoreCardSkeleton() {
  return (
    <div className="dashboard-glass-card mb-4 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-32 bg-white/10 rounded" />
        <div className="h-5 w-5 bg-white/10 rounded" />
      </div>
      <div className="flex items-end gap-2 mb-4">
        <div className="h-12 w-20 bg-white/10 rounded" />
        <div className="h-6 w-12 bg-white/10 rounded mb-1" />
      </div>
      <div className="h-4 w-full bg-white/10 rounded mb-4" />
      <div className="h-2 w-full bg-white/10 rounded-full" />
    </div>
  );
}

function TripsSkeleton() {
  return (
    <div className="dashboard-glass-card mb-4 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-24 bg-white/10 rounded" />
        <div className="h-5 w-5 bg-white/10 rounded" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white/5 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="h-4 w-32 bg-white/10 rounded" />
              <div className="h-4 w-8 bg-white/10 rounded" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 bg-white/10 rounded" />
              <div className="h-3 w-20 bg-white/10 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PoolSkeleton() {
  return (
    <div className="dashboard-glass-card mb-4 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-36 bg-white/10 rounded" />
        <div className="h-5 w-5 bg-white/10 rounded" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-4 w-24 bg-white/10 rounded" />
            <div className="h-4 w-16 bg-white/10 rounded" />
          </div>
        ))}
        <div className="h-2 w-full bg-white/10 rounded-full mt-2" />
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getScoreMessage(score: number): string {
  if (score >= 80) return "Great driving! Keep it up to maximise your refund.";
  if (score >= 70) return "Good progress! A few more safe trips will boost your score.";
  return "Keep practising safe driving to unlock rewards.";
}

const AI_COACH_TIPS = [
  { headline: "Anticipate the road ahead", tip: "Look 10–15 seconds forward. Spotting hazards early means smoother, gentler braking — which directly improves your score.", icon: "👁" },
  { headline: "Lift off gently", tip: "Releasing the accelerator gradually before a junction saves fuel and avoids the hard-braking penalty that chips away at your score.", icon: "🦶" },
  { headline: "Speed limits are scoring limits", tip: "Even brief periods above the limit add speeding seconds to your score. Staying within limits is the single biggest score multiplier.", icon: "🏎" },
  { headline: "Smooth cornering = big gains", tip: "Enter bends at a steady speed rather than braking mid-corner. Your cornering component is worth 20% of your total score.", icon: "↩️" },
  { headline: "Keep phone face-down", tip: "Phone pickups are logged and count against your score. Use Do Not Disturb before you start the engine — every pickup costs points.", icon: "📵" },
  { headline: "Night driving costs more", tip: "Fatigue and reduced visibility increase risk at night. Keeping night trips short and smooth helps your overall risk profile.", icon: "🌙" },
];

function getAiCoachTip(score: number): typeof AI_COACH_TIPS[0] {
  if (score === 0) return AI_COACH_TIPS[0];
  const idx = Math.floor(score * 7.3) % AI_COACH_TIPS.length;
  return AI_COACH_TIPS[idx];
}

function calculateSurplus(score: number, premium: number): number {
  if (score < 70) return 0;
  const scoreRange = Math.max(0, score - 70);
  const baseRefund = 5;
  const additionalRefund = (scoreRange / 30) * 10;
  const totalPercentage = Math.min(baseRefund + additionalRefund, 15);
  return Math.round((totalPercentage / 100) * premium);
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  // Demo mode — read once on mount
  const [demoUser, setDemoUser] = useState<DemoUser | null>(() => {
    if (typeof window === 'undefined') return null;
    const demoModeActive = sessionStorage.getItem('driiva-demo-mode') === 'true';
    if (!demoModeActive) return null;
    try {
      const raw = sessionStorage.getItem('driiva-demo-user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const isDemoMode = demoUser !== null;

  // UI state
  const [showDropdown, setShowDropdown] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  // Resolve userId from AuthContext (no redundant onAuthStateChanged)
  const firebaseUserId = isDemoMode ? null : (user?.id ?? null);

  // Real-time Firestore data
  const { data: dashboardData, loading: dataLoading, error: dataError, refresh } = useDashboardData(
    firebaseUserId
  );

  // Community pool and leaderboard data
  const {
    pool: communityPool,
    poolLoading,
    userShare,
    leaderboard,
  } = useCommunityData(firebaseUserId);

  // Beta estimate (premium + refund)
  const { estimate: betaEstimate, loading: betaEstimateLoading, error: betaEstimateError, refresh: refreshBetaEstimate } = useBetaEstimate(firebaseUserId);

  // Push notifications — opt-in prompt and foreground message handling
  const { toast } = useToast();
  const { permission: notificationPermission, requestPermission: requestNotificationPermission, loading: notificationLoading } = usePushNotifications({
    userId: firebaseUserId,
    onForegroundMessage: (payload: { title: string; body: string }) => {
      toast({ title: payload.title, description: payload.body });
    },
  });

  // Handle logout — navigate FIRST to prevent ProtectedRoute from intercepting
  const handleLogout = () => {
    setShowDropdown(false);
    setLocation("/");
    logout();
  };

  // Derive display values
  const displayName = isDemoMode 
    ? (demoUser?.first_name && demoUser?.last_name 
        ? `${demoUser.first_name} ${demoUser.last_name}` 
        : demoUser?.name || 'Driver')
    : (dashboardData?.displayName || user?.name || 'Driver');

  // Use demo data or real Firestore data
  const drivingScore = isDemoMode
    ? (demoUser?.drivingScore || demoUser?.overall_score || 82)
    : (dashboardData?.drivingScore ?? 0);
  
  const premiumAmount = isDemoMode 
    ? (demoUser?.premiumAmount || demoUser?.premium_amount || 1500) 
    : (dashboardData?.premiumAmount || 0);
  
  const totalMiles = isDemoMode 
    ? (demoUser?.totalMiles || 0) 
    : (dashboardData?.totalMiles || 0);
  
  const trips = isDemoMode 
    ? (demoUser?.trips || []) 
    : (dashboardData?.trips || []);
  
  // Pool data from useCommunityData (or fallback to useDashboardData)
  const poolTotal = isDemoMode 
    ? (demoUser?.poolTotal || 105000) 
    : (communityPool?.totalPoolPounds || dashboardData?.poolTotal || 0);
  
  const poolShare = isDemoMode 
    ? (demoUser?.poolShare || 0) 
    : (userShare?.projectedRefundPounds || dashboardData?.poolShare || 0);
  
  const safetyFactor = isDemoMode 
    ? (demoUser?.safetyFactor || 0.85) 
    : (communityPool?.safetyFactor || dashboardData?.safetyFactor || 1.0);
  
  const activeParticipants = isDemoMode 
    ? 1247 
    : (communityPool?.activeParticipants || dashboardData?.activeParticipants || 0);
  
  const poolDaysRemaining = communityPool?.daysRemaining || 0;
  
  const userSharePercentage = isDemoMode 
    ? 2.5 
    : (userShare?.sharePercentage || 0);
  
  const userRank = isDemoMode 
    ? 14 
    : (leaderboard?.userRank || null);

  // Only show a real policy number — never expose a hardcoded placeholder
  const policyNumber = dashboardData?.policyNumber || null;
  const isNewUser = !isDemoMode && dashboardData?.totalTrips === 0;

  // Calculate surplus projection
  const surplusProjection = isDemoMode && demoUser?.projectedRefund 
    ? demoUser.projectedRefund 
    : (dashboardData?.projectedRefund || calculateSurplus(drivingScore, premiumAmount));

  // Fetch last trip's GPS points for the map polyline
  const [lastTripRoutePoints, setLastTripRoutePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  useEffect(() => {
    if (isDemoMode || !firebaseUserId || !isFirebaseConfigured || !db) return;
    const lastTrip = dashboardData?.trips?.[0];
    if (!lastTrip?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const pointsDoc = await getDoc(doc(db, 'tripPoints', lastTrip.id));
        if (cancelled || !pointsDoc.exists()) return;
        const data = pointsDoc.data();
        const points = (data?.points ?? []) as Array<{ lat: number; lng: number; t: number }>;
        if (points.length >= 2) {
          const sorted = [...points].sort((a, b) => a.t - b.t);
          setLastTripRoutePoints(sorted.map((p) => ({ lat: p.lat, lng: p.lng })));
        }
      } catch (err) {
        console.warn('[Dashboard] Failed to fetch last trip points for map:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isDemoMode, firebaseUserId, dashboardData?.trips]);

  // Loading state — rely on AuthContext loading, not a separate check
  const isLoading = (!isDemoMode && !user) || (!isDemoMode && dataLoading && !dashboardData);

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="pb-24 text-white">
          {/* Header skeleton */}
          <div className="flex items-start justify-between mb-6 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/10" />
              <div>
                <div className="h-6 w-20 bg-white/10 rounded mb-2" />
                <div className="h-4 w-32 bg-white/10 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10" />
              <div className="w-10 h-10 rounded-full bg-white/10" />
            </div>
          </div>
          
          <div className="h-8 w-32 bg-white/10 rounded mb-4 animate-pulse" />
          
          <ScoreCardSkeleton />
          <TripsSkeleton />
          <PoolSkeleton />
        </div>
        <BottomNav />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="pb-24 text-white">
        {/* Push notification opt-in — only when permission not yet asked/granted */}
        {!isDemoMode && firebaseUserId && notificationPermission === 'default' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10"
          >
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-white/80 text-sm">Get notified when trips are scored and refunds are ready</span>
            </div>
            <button
              onClick={() => requestNotificationPermission()}
              disabled={notificationLoading}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {notificationLoading ? '…' : 'Enable'}
            </button>
          </motion.div>
        )}

        {/* Email verification banner — soft prompt, not a hard block */}
        {user && user.emailVerified === false && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)' }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="text-yellow-200 text-sm">Verify your email to secure your account</span>
            </div>
            <button
              onClick={() => setLocation('/verify-email')}
              className="text-xs font-medium text-yellow-300 hover:text-yellow-100 whitespace-nowrap"
            >
              Verify →
            </button>
          </motion.div>
        )}

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between mb-6"
        >
          {/* Left side - Logo and greeting */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-700/30 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Driiva" className="w-full h-full object-cover" />
            </div>
            <div style={{ marginTop: '2px' }}>
              <h1 className="text-xl font-bold text-white">Driiva</h1>
              <p className="text-sm text-white/50">Beta Programme</p>
              {isDemoMode && (
                <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
                  Demo Mode
                </span>
              )}
            </div>
          </div>

          {/* Right side - Bell, refresh, and avatar with dropdown */}
          <div className="flex items-center gap-2 relative">
            {!isDemoMode && (
              <button 
                onClick={refresh}
                className="p-2 rounded-full hover:bg-white/5 transition-colors"
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 text-white/60 ${dataLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button className="p-2 rounded-full hover:bg-white/5 transition-colors">
              <Bell className="w-5 h-5 text-white/60" />
            </button>
            
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">
                  {displayName[0]?.toUpperCase() ?? '?'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {showDropdown && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowDropdown(false)}
                    className="fixed inset-0 z-40"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-12 right-0 w-56 z-50 backdrop-blur-2xl bg-[#1a1a2e]/95 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="p-4">
                      <p className="text-xs text-white/50 mb-1">Policy No:</p>
                      <p className="text-sm font-medium text-white">{policyNumber ?? '—'}</p>
                    </div>
                    <div className="border-t border-white/10">
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-white/5 transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Personalised greeting — time-of-day + full registered name */}
        <h2 className="text-2xl font-bold text-white mb-4">
          {getGreeting()}, {displayName}
        </h2>

        {/* Error banner */}
        {dataError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4" />
            <span>Failed to load some data. Pull to refresh.</span>
          </motion.div>
        )}

        {/* Staggered card container */}
        <motion.div variants={container} initial="hidden" animate="show">

        {/* Driving Score Card */}
        <motion.div variants={item} className="dashboard-glass-card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Driving Score</h2>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>

          {isNewUser ? (
            <div className="flex flex-col items-center py-4">
              <div className="w-[140px] h-[140px] rounded-full border-[6px] border-white/8 flex items-center justify-center mb-3">
                <span className="text-4xl font-bold text-white/30">—</span>
              </div>
              <p className="text-sm text-white/60 text-center">
                Complete your first trip to get a driving score.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <ScoreRing score={drivingScore} size={140} strokeWidth={8} />
              <p className="text-sm text-white/60 mt-3 text-center">
                {getScoreMessage(drivingScore)}
              </p>
            </div>
          )}
          
          {!isDemoMode && !isNewUser && dashboardData?.scoreBreakdown && (
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-5 gap-2 text-center">
              <div>
                <div className="text-xs text-white/40">Speed</div>
                <div className="text-sm font-semibold text-white">{dashboardData.scoreBreakdown.speed}</div>
              </div>
              <div>
                <div className="text-xs text-white/40">Braking</div>
                <div className="text-sm font-semibold text-white">{dashboardData.scoreBreakdown.braking}</div>
              </div>
              <div>
                <div className="text-xs text-white/40">Accel</div>
                <div className="text-sm font-semibold text-white">{dashboardData.scoreBreakdown.acceleration}</div>
              </div>
              <div>
                <div className="text-xs text-white/40">Corners</div>
                <div className="text-sm font-semibold text-white">{dashboardData.scoreBreakdown.cornering}</div>
              </div>
              <div>
                <div className="text-xs text-white/40">Phone</div>
                <div className="text-sm font-semibold text-white">{dashboardData.scoreBreakdown.phoneUsage}</div>
              </div>
            </div>
          )}
        </motion.div>

        {/* AI Coach Card — always visible, zero-latency static insight */}
        <motion.div variants={item} className="mb-4">
          {(() => {
            const tip = getAiCoachTip(drivingScore);
            return (
              <div className="dashboard-glass-card border-indigo-500/20">

                <div className="flex items-center gap-3 mb-3">
                  {/* Pulsing indigo orb */}
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                      <span className="text-base leading-none">✦</span>
                    </div>
                    <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500/20" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">AI Coach</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[10px] font-medium">Beta</span>
                    </div>
                    <p className="text-xs text-white/40 truncate">Personalised driving insights</p>
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-3 mb-3">
                  <p className="text-xs font-semibold text-indigo-300 mb-1">{tip.icon} {tip.headline}</p>
                  <p className="text-xs text-white/70 leading-relaxed">{tip.tip}</p>
                </div>
                <button
                  onClick={() => setLocation('/trips')}
                  className="w-full py-2 rounded-lg bg-indigo-500/15 border border-indigo-400/25 text-indigo-300 text-xs font-medium hover:bg-indigo-500/25 transition-all flex items-center justify-center gap-1.5"
                >
                  View trip-by-trip analysis
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })()}
        </motion.div>

        {/* Beta Estimate Card (non-binding premium + refund) */}
        {!isDemoMode && (
          <motion.div variants={item}>
            <BetaEstimateCard
              estimate={betaEstimate}
              loading={betaEstimateLoading}
              error={betaEstimateError}
              onRefresh={refreshBetaEstimate}
            />
          </motion.div>
        )}

        {/* GPS Map Card — collapsible */}
        <motion.div variants={item} className="dashboard-glass-card mb-4">
          <button
            onClick={() => setMapExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Live Location</h2>
            </div>
            {mapExpanded ? (
              <ChevronUp className="w-5 h-5 text-white/50" />
            ) : (
              <ChevronDown className="w-5 h-5 text-white/50" />
            )}
          </button>
          <AnimatePresence initial={false}>
            {mapExpanded && (
              <motion.div
                key="map-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-4">
                  <Suspense fallback={<MapLoader />}>
                    <LeafletMap
                      className="border border-white/10"
                      routePoints={lastTripRoutePoints.length >= 2 ? lastTripRoutePoints : undefined}
                    />
                  </Suspense>
                  <p className="text-white/40 text-xs mt-3 text-center">
                    {lastTripRoutePoints.length >= 2
                      ? 'Toggle between your live location and last trip route'
                      : 'Showing your current location'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Your Trips Card */}
        <motion.div variants={item} className="dashboard-glass-card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Your Trips</h2>
            <Car className="w-5 h-5 text-white/60" />
          </div>
          {trips.length > 0 ? (
            <div className="space-y-3">
              {trips.map((trip) => (
                <motion.div
                  key={trip.id}
                  whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="bg-white/5 rounded-xl p-3 border border-white/10 cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{trip.from} → {trip.to}</span>
                    <span className={`text-sm font-bold ${trip.score >= 80 ? 'text-emerald-400' : trip.score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                      {trip.score}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>{trip.distance} mi</span>
                    <span>{trip.date}</span>
                  </div>
                </motion.div>
              ))}
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Total Miles</span>
                  <span className="text-white font-semibold">{totalMiles.toLocaleString()} mi</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <Car className="w-8 h-8 text-white/40" />
              </div>
              <p className="text-white/60 text-sm">Start driving to see your first trip!</p>
              <p className="text-white/40 text-xs mt-1">Your journey data will appear here</p>
            </div>
          )}
          
          {/* Start Trip Button */}
          <button
            onClick={() => setLocation('/trip-recording')}
            className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-300 font-medium hover:from-emerald-500/30 hover:to-teal-500/30 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start New Trip
            <Navigation className="w-4 h-4" />
          </button>
        </motion.div>

        {/* Community Pool Card */}
        <motion.div variants={item} className="dashboard-glass-card mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Community Pool</h2>
              {poolDaysRemaining > 0 && !isDemoMode && (
                <p className="text-xs text-white/40">{poolDaysRemaining} days left in period</p>
              )}
            </div>
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          {poolLoading && !isDemoMode ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-24 bg-white/10 rounded" />
                  <div className="h-4 w-16 bg-white/10 rounded" />
                </div>
              ))}
              <div className="h-2 w-full bg-white/10 rounded-full mt-2" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Total Pool</span>
                <span className="text-white font-semibold">£{poolTotal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Your Projected Refund</span>
                <span className="text-emerald-400 font-bold">£{poolShare.toFixed(2)}</span>
              </div>
              {userSharePercentage > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Your Share</span>
                  <span className="text-white font-semibold">{userSharePercentage.toFixed(2)}%</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Safety Factor</span>
                <span className="text-white font-semibold">{Math.round(safetyFactor * 100)}%</span>
              </div>
              {activeParticipants > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Participants</span>
                  <span className="text-white font-semibold">{activeParticipants.toLocaleString()}</span>
                </div>
              )}
              
              {/* Safety Factor Progress Bar */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/40">Safety Factor</span>
                  <span className="text-xs text-white/60">{Math.round(safetyFactor * 100)}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${safetyFactor * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                  />
                </div>
              </div>
              
              {/* Leaderboard Link */}
              <button
                onClick={() => setLocation('/leaderboard')}
                className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-300 font-medium hover:from-purple-500/30 hover:to-pink-500/30 transition-all flex items-center justify-center gap-2"
              >
                <Trophy className="w-4 h-4" />
                {userRank ? `View Leaderboard • You're #${userRank}` : 'View Leaderboard'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>

        {/* Refund Goals Card */}
        <motion.div variants={item} className="dashboard-glass-card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Refund Goals</h2>
            <Target className="w-5 h-5 text-amber-400" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Current Refund</span>
              <span className="text-emerald-400 font-bold text-xl">£{surplusProjection}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Based on {drivingScore}% score</span>
              <span>Max £{Math.round(premiumAmount * 0.15)}</span>
            </div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((surplusProjection / Math.max(premiumAmount * 0.15, 1)) * 100, 100)}%` }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full"
              />
            </div>
            {isNewUser ? (
              <p className="text-white/50 text-xs text-center mt-2">
                Drive safely to unlock refunds up to 15% of your premium!
              </p>
            ) : surplusProjection > 0 ? (
              <p className="text-emerald-300/70 text-xs text-center mt-2">
                You're on track for £{surplusProjection} back this period. Refunds are calculated at the end of each period.
              </p>
            ) : drivingScore < 70 ? (
              <p className="text-amber-300/70 text-xs text-center mt-2">
                Score 70+ to qualify for a refund. Keep driving safely!
              </p>
            ) : null}
            <FinancialPromotionDisclaimer className="mt-3 text-center" />
          </div>
        </motion.div>

        {/* Achievements Card */}
        <motion.div variants={item} className="dashboard-glass-card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Achievements</h2>
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          {(isDemoMode || (dashboardData?.totalTrips || 0) > 0) ? (
            <>
              <div className="flex gap-3 overflow-x-auto pb-2 mb-4">
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-amber-400" />
                </div>
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                  <Car className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Target className="w-8 h-8 text-blue-400" />
                </div>
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-white/30 text-2xl">?</span>
                </div>
              </div>
              <button
                onClick={() => setLocation('/achievements')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/30 text-amber-300 font-medium hover:from-amber-500/30 hover:to-amber-600/30 transition-all flex items-center justify-center gap-2"
              >
                <Trophy className="w-4 h-4" />
                View All Achievements
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Trophy className="w-10 h-10 text-white/20 mb-3" />
              <p className="text-white/50 text-sm mb-4">Complete trips to unlock achievements!</p>
              <button
                onClick={() => setLocation('/achievements')}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white/70 text-sm hover:bg-white/15 transition-all flex items-center gap-2"
              >
                View Achievements
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>

        {/* Bottom Action Buttons */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setLocation('/profile')}
            className="dashboard-glass-card flex items-center justify-center gap-2 py-4 hover:bg-white/15 transition-colors"
          >
            <FileText className="w-5 h-5 text-white" />
            <span className="font-medium text-white">Profile</span>
          </button>
          
          <button
            onClick={() => setLocation('/settings')}
            className="dashboard-glass-card flex items-center justify-center gap-2 py-4 hover:bg-white/15 transition-colors"
          >
            <AlertCircle className="w-5 h-5 text-white" />
            <span className="font-medium text-white">Settings</span>
          </button>
        </motion.div>

        </motion.div>{/* close staggered container */}

        {/* Trust Centre footer row */}
        <div className="flex items-center justify-center gap-4 pt-2 pb-2">
          <button
            onClick={() => setLocation('/trust')}
            className="flex items-center gap-1 text-white/30 text-[11px] hover:text-white/60 transition-colors"
          >
            <Shield className="w-3 h-3" />
            Trust Centre
          </button>
          <span className="text-white/20 text-[11px]">·</span>
          <button
            onClick={() => setLocation('/terms')}
            className="text-white/30 text-[11px] hover:text-white/60 transition-colors"
          >
            Terms
          </button>
          <span className="text-white/20 text-[11px]">·</span>
          <button
            onClick={() => setLocation('/privacy')}
            className="flex items-center gap-1 text-white/30 text-[11px] hover:text-white/60 transition-colors"
          >
            Privacy
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
