/**
 * DRIVING AI FEEDBACK WIDGET ("AI Driiva")
 * ========================================
 * Inline widget placed below score breakdown on trip detail pages.
 *
 * Compact state (default): pulsing indigo orb + local round-robin insight.
 * Expanded state: LLM-powered deep analysis via /api/ai/driiva.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, RefreshCw, Sparkles } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { ScoreBreakdown, TripEvents, TripContext } from '../../../shared/firestore-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TripScoreData {
  tripId: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  events: TripEvents;
  distanceMeters: number;
  durationSeconds: number;
  context: TripContext | null;
  averageScore?: number;
  totalTrips?: number;
}

interface CoachResponse {
  headline: string;
  tips: string[];
  encouragement: string;
}

// ---------------------------------------------------------------------------
// Local insight templates — zero-latency, no API call
// ---------------------------------------------------------------------------

interface InsightTemplate {
  condition: (d: TripScoreData) => boolean;
  text: (d: TripScoreData) => string;
}

const INSIGHT_TEMPLATES: InsightTemplate[] = [
  {
    condition: (d) => d.scoreBreakdown.speedScore < 65,
    text: (d) => `Speed management is your biggest lever — improving it could lift your score by ${Math.round((80 - d.scoreBreakdown.speedScore) * 0.25)} points.`,
  },
  {
    condition: (d) => d.scoreBreakdown.brakingScore > 90,
    text: () => 'Smooth braking champion — your anticipation skills are top-tier.',
  },
  {
    condition: (d) => d.scoreBreakdown.brakingScore < 65,
    text: (d) => `${d.events.hardBrakingCount} hard braking event${d.events.hardBrakingCount !== 1 ? 's' : ''} detected. Try leaving more following distance.`,
  },
  {
    condition: (d) => d.scoreBreakdown.accelerationScore < 65,
    text: () => 'Gentler acceleration off the line can improve both your score and fuel economy.',
  },
  {
    condition: (d) => d.scoreBreakdown.accelerationScore > 90,
    text: () => 'Excellent throttle control — smooth acceleration is saving you points and fuel.',
  },
  {
    condition: (d) => d.scoreBreakdown.corneringScore < 65,
    text: (d) => `${d.events.sharpTurnCount} sharp turn${d.events.sharpTurnCount !== 1 ? 's' : ''} flagged. Slower entry speeds make corners safer.`,
  },
  {
    condition: (d) => d.scoreBreakdown.corneringScore > 90,
    text: () => 'Your cornering is textbook — smooth lines and controlled entry speeds.',
  },
  {
    condition: (d) => d.events.speedingSeconds > 30,
    text: (d) => `You were over the speed limit for ${d.events.speedingSeconds}s. Even brief bursts affect your score significantly.`,
  },
  {
    condition: (d) => d.score > 90,
    text: () => "Outstanding trip — you're driving like a professional. Keep it up!",
  },
  {
    condition: (d) => (d.averageScore ?? 0) > 0 && d.score > (d.averageScore ?? 0) + 5,
    text: (d) => `This trip scored ${Math.round(d.score - (d.averageScore ?? 0))} points above your average — great improvement.`,
  },
  {
    condition: (d) => (d.averageScore ?? 0) > 0 && d.score < (d.averageScore ?? 0) - 5,
    text: (d) => `This trip was ${Math.round((d.averageScore ?? 0) - d.score)} points below your average. Context matters — check the conditions.`,
  },
  {
    condition: (d) => d.context?.isNightDriving === true,
    text: () => 'Night driving tends to lower scores — extra caution with speed and following distance helps.',
  },
  {
    condition: (d) => d.context?.isRushHour === true && d.score > 75,
    text: () => 'Solid score during rush hour — navigating traffic well is a real skill.',
  },
  {
    condition: (d) => d.distanceMeters > 50000,
    text: () => 'Long trip, consistent driving. Fatigue breaks every 2 hours help maintain focus.',
  },
  {
    condition: () => true,
    text: (d) => d.score >= 70
      ? "You're on track for community pool refunds. Every safe trip counts."
      : 'Focus on smooth braking and steady speeds to get your score above 70 for refund eligibility.',
  },
];

function getLocalInsight(data: TripScoreData): string {
  const match = INSIGHT_TEMPLATES.find((t) => t.condition(data));
  return match ? match.text(data) : 'Drive safely to keep building your score.';
}

// ---------------------------------------------------------------------------
// API call for deep feedback
// ---------------------------------------------------------------------------

async function fetchCoachFeedback(data: TripScoreData): Promise<CoachResponse> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');

  const uid = auth?.currentUser?.uid ?? null;

  const res = await fetch('/api/ai/coach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      score: data.score,
      scoreBreakdown: data.scoreBreakdown,
      events: data.events,
      distanceMeters: data.distanceMeters,
      durationSeconds: data.durationSeconds,
      context: data.context,
      averageScore: data.averageScore,
      totalTrips: data.totalTrips,
    }),
  });

  if (!res.ok) {
    throw new Error(`Coach API error: ${res.status}`);
  }

  const response: CoachResponse = await res.json();

  if (db) {
    addDoc(collection(db, 'ai_feedback_events'), {
      userId: uid,
      tripId: data.tripId,
      score: data.score,
      requestedAt: Timestamp.now(),
      createdBy: uid,
    }).catch(() => {});
  }

  return response;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DrivingAIFeedbackWidgetProps {
  data: TripScoreData;
  className?: string;
}

export default function DrivingAIFeedbackWidget({
  data,
  className = '',
}: DrivingAIFeedbackWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const localInsight = useMemo(() => getLocalInsight(data), [data]);

  const {
    data: coachResponse,
    isLoading,
    error,
    refetch,
  } = useQuery<CoachResponse>({
    queryKey: ['ai-coach', data.tripId],
    queryFn: () => fetchCoachFeedback(data),
    enabled: expanded,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  return (
    <motion.div
      layout
      className={`backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden ${className}`}
    >
      {/* ── Compact header (always visible) ── */}
      <div className="p-4 flex items-center gap-3">
        {/* Pulsing AI orb */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
            <div
              className="w-5 h-5 rounded-full bg-indigo-500 animate-pulse"
              style={{ boxShadow: '0 0 12px 4px rgba(99,102,241,0.4)' }}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-semibold text-indigo-300">AI Driiva</span>
          </div>
          <p className="text-sm text-white/70 leading-snug">{localInsight}</p>
        </div>
      </div>

      {/* ── Expand toggle ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-white/[0.06] text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        {expanded ? 'Hide' : 'Get Deeper Feedback'}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.div>
      </button>

      {/* ── Expanded content ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Loading */}
              {isLoading && (
                <div className="flex items-center gap-3 py-6 justify-center">
                  <div className="h-1 w-32 rounded-full overflow-hidden bg-white/10">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                      style={{ width: '60%' }}
                    />
                  </div>
                  <span className="text-xs text-white/40">AI analysing your trip...</span>
                </div>
              )}

              {/* Error */}
              {error && !isLoading && (
                <div className="text-center py-4 space-y-2">
                  <p className="text-xs text-white/50">AI Driiva is taking a break. Try again shortly.</p>
                  <button
                    onClick={() => refetch()}
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              )}

              {/* Response */}
              {coachResponse && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {/* Headline */}
                  <p className="text-sm font-medium text-white leading-snug">
                    {coachResponse.headline}
                  </p>

                  {/* Tips */}
                  {coachResponse.tips.length > 0 && (
                    <div className="space-y-2">
                      {coachResponse.tips.map((tip, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                          <p className="text-xs text-white/70 leading-relaxed">{tip}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Encouragement */}
                  <div className="flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-emerald-300 leading-relaxed">
                      {coachResponse.encouragement}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
