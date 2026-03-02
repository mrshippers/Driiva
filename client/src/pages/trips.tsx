/**
 * TRIPS PAGE
 * ==========
 * Shows user's trip history with proper loading, empty, error, and data states.
 * 
 * Features:
 *   - Real-time Firestore data for authenticated users
 *   - Demo mode support with mock trip data
 *   - Graceful empty state for new users
 *   - Consistent glassmorphic card design (dashboard-glass-card)
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { PageWrapper } from '../components/PageWrapper';
import { BottomNav } from '../components/BottomNav';
import { Map, Car, AlertCircle, Play, Navigation, RefreshCw, ChevronLeft } from "lucide-react";
import { useAuth } from '../contexts/AuthContext';
import { getUserTrips } from '@/lib/firestore';
import type { TripDocument } from '../../../shared/firestore-types';

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

/** Format a TripLocation label for display */
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

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function Trips() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [trips, setTrips] = useState<TripDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Demo mode detection
  const isDemoMode = typeof window !== 'undefined' && sessionStorage.getItem('driiva-demo-mode') === 'true';

  // Fetch trips from Firestore (or load demo data)
  useEffect(() => {
    if (isDemoMode) {
      // Demo mode — skip Firestore, no loading spinner
      setLoading(false);
      return;
    }

    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchTrips() {
      try {
        setLoading(true);
        setError(null);
        const result = await getUserTrips({
          userId: user!.id,
          status: 'completed',
          limit: 50,
        });
        if (!cancelled) {
          setTrips(result);
        }
      } catch (err) {
        console.error('[Trips] Failed to fetch trips:', err);
        if (!cancelled) {
          setError('Failed to load trips. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTrips();
    return () => { cancelled = true; };
  }, [user?.id, isDemoMode]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    // Re-trigger useEffect by updating a dependency
    window.location.reload();
  };

  // Determine what to render
  const hasRealTrips = !isDemoMode && trips.length > 0;
  const hasDemoTrips = isDemoMode && DEMO_TRIPS.length > 0;
  const isEmpty = !loading && !error && !hasRealTrips && !hasDemoTrips;

  const totalTrips = isDemoMode ? DEMO_TRIPS.length : trips.length;
  const totalMiles = isDemoMode 
    ? DEMO_TRIPS.reduce((sum, t) => sum + t.distance, 0).toFixed(1)
    : trips.reduce((sum, t) => sum + (t.distanceMeters / 1609.34), 0).toFixed(1);

  return (
    <PageWrapper>
      <div className="pb-24 text-white">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between mb-6"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/dashboard')}
              className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
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
              {totalTrips} trip{totalTrips !== 1 ? 's' : ''}{Number(totalMiles) > 0 ? ` • ${totalMiles} mi total` : ''}
            </p>
          </motion.div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="dashboard-glass-card p-5 animate-pulse">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-white/10 rounded-xl" />
                    <div>
                      <div className="h-4 w-32 bg-white/10 rounded mb-2" />
                      <div className="h-3 w-24 bg-white/10 rounded" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="h-6 w-8 bg-white/10 rounded mb-1" />
                    <div className="h-3 w-12 bg-white/10 rounded" />
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-3 gap-3">
                  {[1, 2, 3].map(j => (
                    <div key={j} className="text-center">
                      <div className="h-3 w-12 bg-white/10 rounded mx-auto mb-1" />
                      <div className="h-4 w-6 bg-white/10 rounded mx-auto" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="dashboard-glass-card p-6 text-center"
          >
            <AlertCircle className="w-10 h-10 text-red-400/60 mx-auto mb-3" />
            <p className="text-red-300 text-sm mb-4">{error}</p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white/70 text-sm hover:bg-white/15 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </motion.div>
        )}

        {/* Empty state — new user with no trips */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="dashboard-glass-card p-8 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
              <Car className="w-8 h-8 text-white/40" />
            </div>
            <h3 className="text-white/80 font-semibold text-lg mb-2">No trips yet</h3>
            <p className="text-white/40 text-sm mb-6">
              Start your first trip to see your driving history and scores here.
            </p>
            <button
              onClick={() => setLocation('/trip-recording')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-300 font-medium hover:from-emerald-500/30 hover:to-teal-500/30 transition-all"
            >
              <Play className="w-4 h-4" />
              Start Your First Trip
              <Navigation className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Demo trips list */}
        {isDemoMode && !loading && !error && (
          <motion.div 
            className="space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {DEMO_TRIPS.map((trip, index) => (
              <motion.div
                key={trip.tripId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * index, duration: 0.4 }}
                className="dashboard-glass-card p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                      <Map className="w-5 h-5 text-white/70" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">
                        {trip.from} → {trip.to}
                      </h3>
                      <p className="text-xs text-white/50 mt-0.5">
                        {trip.date} • {trip.durationMinutes} min
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-semibold ${getScoreColor(trip.score)}`}>
                      {trip.score}
                    </div>
                    <div className="text-xs text-white/50">{trip.distance} mi</div>
                  </div>
                </div>
                
                <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xs text-white/40 mb-1">Braking</div>
                    <div className="text-sm font-medium text-white/80">{trip.hardBrakingCount}</div>
                  </div>
                  <div className="text-center border-x border-white/5">
                    <div className="text-xs text-white/40 mb-1">Acceleration</div>
                    <div className="text-sm font-medium text-white/80">{trip.hardAccelerationCount}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-white/40 mb-1">Speed</div>
                    <div className="text-sm font-medium text-white/80">{trip.speedingSeconds}s</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Real Firestore trips list */}
        {hasRealTrips && !loading && !error && (
          <motion.div 
            className="space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {trips.map((trip, index) => {
              const distanceMiles = (trip.distanceMeters / 1609.34).toFixed(1);
              const durationMinutes = Math.round(trip.durationSeconds / 60);
              const startLabel = locationLabel(trip.startLocation);
              const endLabel = locationLabel(trip.endLocation);
              const tripDate = trip.startedAt?.toDate?.() ?? new Date();

              return (
                <motion.div
                  key={trip.tripId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index, duration: 0.4 }}
                  className="dashboard-glass-card p-5 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => setLocation(`/trips/${trip.tripId}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                        <Map className="w-5 h-5 text-white/70" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-sm">
                          {startLabel} → {endLabel}
                        </h3>
                        <p className="text-xs text-white/50 mt-0.5">
                          {tripDate.toLocaleDateString('en-GB', { 
                            weekday: 'short', 
                            day: 'numeric', 
                            month: 'short' 
                          })} • {durationMinutes} min
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-semibold ${getScoreColor(trip.score)}`}>
                        {trip.score}
                      </div>
                      <div className="text-xs text-white/50">{distanceMiles} mi</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-xs text-white/40 mb-1">Braking</div>
                      <div className="text-sm font-medium text-white/80">{trip.events.hardBrakingCount}</div>
                    </div>
                    <div className="text-center border-x border-white/5">
                      <div className="text-xs text-white/40 mb-1">Acceleration</div>
                      <div className="text-sm font-medium text-white/80">{trip.events.hardAccelerationCount}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-white/40 mb-1">Speed</div>
                      <div className="text-sm font-medium text-white/80">{trip.events.speedingSeconds}s</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Start Trip Button — always visible when not loading/error */}
        {!loading && !error && !isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-6"
          >
            <button
              onClick={() => setLocation('/trip-recording')}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-300 font-medium hover:from-emerald-500/30 hover:to-teal-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start New Trip
              <Navigation className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </div>
      
      <BottomNav />
    </PageWrapper>
  );
}
