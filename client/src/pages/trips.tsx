/**
 * TRIPS PAGE
 * ==========
 * Shows user's trip history with pull-to-refresh, swipeable cards, and shimmer loading.
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { PageWrapper } from '../components/PageWrapper';
import { BottomNav } from '../components/BottomNav';
import { Map, Car, AlertCircle, Play, Navigation, RefreshCw, ChevronLeft } from "lucide-react";
import { useAuth } from '../contexts/AuthContext';
import { getUserTrips } from '@/lib/firestore';
import type { TripDocument } from '../../../shared/firestore-types';
import { SwipeTripCard } from '@/components/SwipeTripCard';
import { TripCardShimmer } from '@/components/Shimmer';
import { PullToRefreshIndicator } from '@/components/PullToRefresh';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useHaptics } from '@/hooks/useHaptics';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { container, item } from '@/lib/animations';

// ============================================================================
// DEMO DATA
// ============================================================================

interface DemoTrip {
  tripId: string;
  from: string;
  to: string;
  score: number;
  distance: number;
  date: string;
  durationMinutes: number;
  hardBrakingCount: number;
  hardAccelerationCount: number;
  speedingSeconds: number;
}

const DEMO_TRIPS: DemoTrip[] = [
  {
    tripId: 'demo-trip-1',
    from: 'Home',
    to: 'Office',
    score: 92,
    distance: 12.3,
    date: 'Mon, 10 Feb',
    durationMinutes: 25,
    hardBrakingCount: 1,
    hardAccelerationCount: 0,
    speedingSeconds: 0,
  },
  {
    tripId: 'demo-trip-2',
    from: 'Office',
    to: 'Grocery Store',
    score: 88,
    distance: 5.7,
    date: 'Mon, 10 Feb',
    durationMinutes: 14,
    hardBrakingCount: 2,
    hardAccelerationCount: 1,
    speedingSeconds: 5,
  },
  {
    tripId: 'demo-trip-3',
    from: 'Grocery Store',
    to: 'Home',
    score: 95,
    distance: 6.1,
    date: 'Sun, 9 Feb',
    durationMinutes: 16,
    hardBrakingCount: 0,
    hardAccelerationCount: 0,
    speedingSeconds: 0,
  },
];

// ============================================================================
// HELPERS
// ============================================================================

function locationLabel(loc: TripDocument['startLocation']): string {
  if (loc.placeType && loc.placeType !== 'other') {
    return loc.placeType.charAt(0).toUpperCase() + loc.placeType.slice(1);
  }
  if (loc.address) {
    const first = loc.address.split(',')[0].trim();
    return first.length > 20 ? first.slice(0, 17) + '...' : first;
  }
  return 'Unknown';
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function Trips() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const haptics = useHaptics();
  const [trips, setTrips] = useState<TripDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDemoMode = typeof window !== 'undefined' && sessionStorage.getItem('driiva-demo-mode') === 'true';

  const fetchTrips = useCallback(async () => {
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await getUserTrips({
        userId: user.id,
        status: 'completed',
        limit: 50,
      });
      setTrips(result);
    } catch (err) {
      console.error('[Trips] Failed to fetch trips:', err);
      setError('Failed to load trips. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, isDemoMode]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  // Pull-to-refresh
  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await fetchTrips();
      await new Promise(r => setTimeout(r, 400));
    },
    disabled: isDemoMode,
  });

  const hasRealTrips = !isDemoMode && trips.length > 0;
  const hasDemoTrips = isDemoMode && DEMO_TRIPS.length > 0;
  const isEmpty = !loading && !error && !hasRealTrips && !hasDemoTrips;

  const totalTrips = isDemoMode ? DEMO_TRIPS.length : trips.length;
  const totalMiles = isDemoMode
    ? DEMO_TRIPS.reduce((sum, t) => sum + t.distance, 0)
    : trips.reduce((sum, t) => sum + (t.distanceMeters / 1609.34), 0);

  return (
    <PageWrapper>
      <div className="pb-24 text-white" {...pullToRefresh.handlers}>
        {/* Pull-to-refresh indicator */}
        <PullToRefreshIndicator
          pullDistance={pullToRefresh.pullDistance}
          progress={pullToRefresh.progress}
          refreshing={pullToRefresh.refreshing}
        />

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-start justify-between mb-6"
        >
          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { haptics.light(); setLocation('/dashboard'); }}
              className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </motion.button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-700/30 border border-white/10 flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="Driiva" className="w-full h-full object-cover" />
              </div>
              <div style={{ marginTop: '2px' }}>
                <h1 className="text-xl font-bold text-white">Driiva</h1>
                <p className="text-sm text-white/50">Your trip history</p>
                {isDemoMode && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
                    Demo Mode
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <h2 className="text-2xl font-bold text-white mb-2">Recent Trips</h2>

        {!loading && (
          <motion.div
            className="mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-sm text-white/50">
              {totalTrips} trip{totalTrips !== 1 ? 's' : ''}
              {totalMiles > 0 && (
                <> · <AnimatedNumber value={totalMiles} decimals={1} className="text-white/50" suffix="mi total" /></>
              )}
            </p>
          </motion.div>
        )}

        {/* Shimmer loading skeleton */}
        {loading && (
          <div className="space-y-3">
            <TripCardShimmer />
            <TripCardShimmer />
            <TripCardShimmer />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="dashboard-glass-card p-6 text-center"
          >
            <AlertCircle className="w-10 h-10 text-red-400/60 mx-auto mb-3" />
            <p className="text-red-300 text-sm mb-4">{error}</p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { haptics.light(); fetchTrips(); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white/70 text-sm hover:bg-white/15 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </motion.button>
          </motion.div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="dashboard-glass-card p-8 text-center"
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.03] flex items-center justify-center mx-auto mb-5 border border-white/[0.06]"
            >
              <Car className="w-10 h-10 text-white/30" />
            </motion.div>
            <h3 className="text-white/80 font-semibold text-lg mb-2">No trips yet</h3>
            <p className="text-white/40 text-sm mb-6">
              Start your first trip to see your driving history and scores here.
            </p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => { haptics.medium(); setLocation('/trip-recording'); }}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-300 font-semibold hover:from-emerald-500/30 hover:to-teal-500/30 transition-all"
            >
              <Play className="w-4 h-4" />
              Start Your First Trip
              <Navigation className="w-4 h-4" />
            </motion.button>
          </motion.div>
        )}

        {/* Demo trips list — using SwipeTripCard */}
        {isDemoMode && !loading && !error && (
          <motion.div
            className="space-y-3"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {DEMO_TRIPS.map((trip, index) => (
              <SwipeTripCard
                key={trip.tripId}
                tripId={trip.tripId}
                from={trip.from}
                to={trip.to}
                score={trip.score}
                distance={`${trip.distance} mi`}
                date={trip.date}
                duration={`${trip.durationMinutes} min`}
                events={{
                  braking: trip.hardBrakingCount,
                  acceleration: trip.hardAccelerationCount,
                  speeding: `${trip.speedingSeconds}s`,
                }}
                onTap={() => {}}
                index={index}
              />
            ))}
          </motion.div>
        )}

        {/* Real Firestore trips — using SwipeTripCard */}
        {hasRealTrips && !loading && !error && (
          <motion.div
            className="space-y-3"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {trips.map((trip, index) => {
              const distanceMiles = (trip.distanceMeters / 1609.34).toFixed(1);
              const durationMinutes = Math.round(trip.durationSeconds / 60);
              const startLabel = locationLabel(trip.startLocation);
              const endLabel = locationLabel(trip.endLocation);
              const tripDate = trip.startedAt?.toDate?.() ?? new Date();

              return (
                <SwipeTripCard
                  key={trip.tripId}
                  tripId={trip.tripId}
                  from={startLabel}
                  to={endLabel}
                  score={trip.score}
                  distance={`${distanceMiles} mi`}
                  date={tripDate.toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  duration={`${durationMinutes} min`}
                  events={{
                    braking: trip.events.hardBrakingCount,
                    acceleration: trip.events.hardAccelerationCount,
                    speeding: `${trip.events.speedingSeconds}s`,
                  }}
                  onTap={() => setLocation(`/trips/${trip.tripId}`)}
                  index={index}
                />
              );
            })}
          </motion.div>
        )}

        {/* Start Trip Button */}
        {!loading && !error && !isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-6"
          >
            <motion.button
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              onClick={() => { haptics.medium(); setLocation('/trip-recording'); }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-300 font-semibold hover:from-emerald-500/30 hover:to-teal-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start New Trip
              <Navigation className="w-4 h-4" />
            </motion.button>
          </motion.div>
        )}
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
