/**
 * TRIP DETAIL PAGE
 * ================
 * Shows full details for a single trip including route map, score breakdown,
 * and driving events. Loads trip doc + tripPoints from Firestore.
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { useRoute, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Clock, Route, Gauge, AlertTriangle, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { PageWrapper } from '../components/PageWrapper';
import { BottomNav } from '../components/BottomNav';
import DrivingAIFeedbackWidget from '../components/DrivingAIFeedbackWidget';
import { useAuth } from '@/contexts/AuthContext';
import { useFirestoreDoc } from '@/hooks/useFirestoreDoc';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import type { TripDocument, TripPoint } from '../../../shared/firestore-types';

const TripAIInsights = lazy(() => import('../components/TripAIInsights'));

const TripRouteMap = lazy(() => import('../components/TripRouteMap'));

function getScoreColor(score: number): string {
  if (score < 60) return 'text-red-400';
  if (score < 80) return 'text-amber-400';
  return 'text-emerald-400';
}

function getScoreBg(score: number): string {
  if (score < 60) return 'from-red-500/20 to-red-600/20 border-red-500/30';
  if (score < 80) return 'from-amber-500/20 to-amber-600/20 border-amber-500/30';
  return 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/30';
}

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center p-3 bg-white/[0.03] border border-white/[0.05] rounded-xl">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs text-white/50">{label}</div>
      {sub && <div className="text-xs text-white/30 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function TripDetail() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/trips/:tripId');
  const { user } = useAuth();
  const { aiInsights: aiEnabled } = useFeatureFlags();
  const tripId = params?.tripId ?? '';

  // Real-time trip document — AI analysis field appears live when Cloud Function writes it
  const tripPath = tripId && isFirebaseConfigured ? `trips/${tripId}` : null;
  const { data: tripData, loading: tripLoading, error: tripError } = useFirestoreDoc<TripDocument>(tripPath);

  const [points, setPoints] = useState<TripPoint[]>([]);
  const [pointsLoading, setPointsLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Trip points are immutable after creation — one-shot fetch is fine
  useEffect(() => {
    if (!tripId || !isFirebaseConfigured || !db) {
      setPointsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const pointsSnap = await getDoc(doc(db, 'tripPoints', tripId));
        if (cancelled) return;
        if (pointsSnap.exists()) {
          const data = pointsSnap.data();
          setPoints((data?.points ?? []) as TripPoint[]);
        }
      } catch (err) {
        console.error('[TripDetail] Points load error:', err);
      } finally {
        if (!cancelled) setPointsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tripId]);

  // Access check — only allow the trip owner
  useEffect(() => {
    if (!tripData || !user) return;
    if (tripData.userId !== user.id) {
      setAccessError('You do not have access to this trip.');
    } else {
      setAccessError(null);
    }
  }, [tripData, user]);

  const trip = accessError ? null : tripData;
  const loading = tripLoading || pointsLoading;
  const error = accessError || (tripError ? 'Failed to load trip details.' : (!tripLoading && !tripData ? 'Trip not found.' : null));

  if (loading) {
    return (
      <PageWrapper>
        <div className="pb-24 text-white animate-pulse">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-4 bg-white/10 rounded" />
            <div className="h-4 w-24 bg-white/10 rounded" />
          </div>
          <div className="h-8 w-48 bg-white/10 rounded mb-4" />
          <div className="h-[280px] bg-white/[0.04] rounded-xl mb-6" />
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="dashboard-glass-card p-4 text-center">
                <div className="h-6 w-12 bg-white/10 rounded mx-auto mb-2" />
                <div className="h-3 w-16 bg-white/10 rounded mx-auto" />
              </div>
            ))}
          </div>
          <div className="dashboard-glass-card p-4 mb-4">
            <div className="h-5 w-32 bg-white/10 rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i}>
                  <div className="flex justify-between mb-1">
                    <div className="h-3 w-16 bg-white/10 rounded" />
                    <div className="h-3 w-8 bg-white/10 rounded" />
                  </div>
                  <div className="h-2 bg-white/10 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    );
  }

  if (error || !trip) {
    return (
      <PageWrapper>
        <div className="pb-24 text-white">
          <button
            onClick={() => setLocation('/trips')}
            className="flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Trips
          </button>
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
            <AlertTriangle className="w-10 h-10 text-amber-400/60" />
            <p className="text-white/70 text-sm">{error || 'Trip not found.'}</p>
            <button
              onClick={() => setLocation('/trips')}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-sm text-white/70 hover:bg-white/15 transition-colors min-h-[44px]"
            >
              View All Trips
            </button>
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    );
  }

  const distanceMiles = (trip.distanceMeters / 1609.34).toFixed(1);
  const durationMinutes = Math.round(trip.durationSeconds / 60);
  const tripDate = trip.startedAt?.toDate?.();
  const startLabel = trip.startLocation.address?.split(',')[0] || 'Start';
  const endLabel = trip.endLocation.address?.split(',')[0] || 'End';

  return (
    <PageWrapper>
      <div className="pb-24 text-white space-y-4">
        <button
          onClick={() => setLocation('/trips')}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Trips
        </button>

        {/* Trip header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">{startLabel} → {endLabel}</h1>
              {tripDate && (
                <p className="text-sm text-white/50 mt-1">
                  {tripDate.toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getScoreBg(trip.score)} border flex items-center justify-center`}>
              <span className={`text-2xl font-bold ${getScoreColor(trip.score)}`}>{Math.round(trip.score)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatBlock label="Distance" value={`${distanceMiles} mi`} />
            <StatBlock label="Duration" value={`${durationMinutes} min`} />
            <StatBlock label="Points" value={`${trip.pointsCount}`} sub="GPS" />
          </div>
        </motion.div>

        {/* Route map */}
        {points.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4"
          >
            <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
              <Route className="w-4 h-4 text-emerald-400" />
              Route
            </h2>
            <Suspense fallback={
              <div className="h-[350px] flex items-center justify-center bg-[#1a1a2e]/50 rounded-xl">
                <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
              </div>
            }>
              <TripRouteMap points={points} className="border border-white/10" />
            </Suspense>
          </motion.div>
        )}

        {/* Score breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4"
        >
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-blue-400" />
            Score Breakdown
          </h2>
          <div className="space-y-3">
            {[
              { label: 'Speed', value: trip.scoreBreakdown.speedScore, weight: '25%' },
              { label: 'Braking', value: trip.scoreBreakdown.brakingScore, weight: '25%' },
              { label: 'Acceleration', value: trip.scoreBreakdown.accelerationScore, weight: '20%' },
              { label: 'Cornering', value: trip.scoreBreakdown.corneringScore, weight: '20%' },
              { label: 'Phone Usage', value: trip.scoreBreakdown.phoneUsageScore, weight: '10%' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white/60">{item.label} ({item.weight})</span>
                  <span className={`text-sm font-semibold ${getScoreColor(item.value)}`}>{Math.round(item.value)}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.value >= 80 ? 'bg-emerald-500' : item.value >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

                  {/* AI Driiva — quick local insights */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <DrivingAIFeedbackWidget
            data={{
              tripId,
              score: trip.score,
              scoreBreakdown: trip.scoreBreakdown,
              events: trip.events,
              distanceMeters: trip.distanceMeters,
              durationSeconds: trip.durationSeconds,
              context: trip.context,
            }}
          />
        </motion.div>

        {/* Claude AI Analysis — deep insights from Cloud Functions pipeline */}
        {aiEnabled && trip.status === 'completed' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Suspense fallback={
              <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 animate-pulse">
                <div className="h-5 w-28 bg-white/10 rounded mb-4" />
                <div className="space-y-3">
                  <div className="h-16 bg-white/10 rounded-xl" />
                  <div className="h-12 bg-white/10 rounded-xl" />
                </div>
              </div>
            }>
              <TripAIInsights tripId={tripId} tripStatus={trip.status} />
            </Suspense>
          </motion.div>
        )}

        {/* Driving events */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4"
        >
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Driving Events
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatBlock label="Hard Braking" value={String(trip.events.hardBrakingCount)} />
            <StatBlock label="Hard Acceleration" value={String(trip.events.hardAccelerationCount)} />
            <StatBlock label="Speeding" value={`${trip.events.speedingSeconds}s`} />
            <StatBlock label="Sharp Turns" value={String(trip.events.sharpTurnCount)} />
          </div>
        </motion.div>

        {/* Trip context */}
        {trip.context && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4"
          >
            <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-purple-400" />
              Trip Context
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2">
                <div className="text-sm font-medium text-white">{trip.context.isNightDriving ? 'Yes' : 'No'}</div>
                <div className="text-xs text-white/50">Night Drive</div>
              </div>
              <div className="p-2">
                <div className="text-sm font-medium text-white">{trip.context.isRushHour ? 'Yes' : 'No'}</div>
                <div className="text-xs text-white/50">Rush Hour</div>
              </div>
              <div className="p-2">
                <div className="text-sm font-medium text-white">{trip.context.weatherCondition ?? '—'}</div>
                <div className="text-xs text-white/50">Weather</div>
              </div>
            </div>
          </motion.div>
        )}

      </div>

      <BottomNav />
    </PageWrapper>
  );
}
