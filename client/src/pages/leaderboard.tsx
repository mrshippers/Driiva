/**
 * LEADERBOARD PAGE
 * ================
 * Displays community rankings with real Firestore data.
 * 
 * Features:
 *   - Weekly/Monthly/All-time period switching
 *   - Real-time rank updates
 *   - User's position highlighted
 *   - Anonymized driver names for privacy
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Trophy, TrendingUp, TrendingDown, Minus, RefreshCw, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageWrapper } from '../components/PageWrapper';
import { BottomNav } from '../components/BottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommunityData, LeaderboardEntry } from '@/hooks/useCommunityData';
import { useAuth } from '@/contexts/AuthContext';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-white/10" />
            <div className="h-4 w-24 bg-white/10 rounded" />
          </div>
          <div className="flex items-center space-x-3">
            <div className="h-5 w-10 bg-white/10 rounded" />
            <div className="h-4 w-8 bg-white/10 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="text-center">
          <div className="h-6 w-16 mx-auto bg-white/10 rounded mb-1" />
          <div className="h-3 w-12 mx-auto bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface RankBadgeProps {
  rank: number;
}

function RankBadge({ rank }: RankBadgeProps) {
  const getColor = () => {
    if (rank === 1) return "bg-yellow-500 text-black";
    if (rank === 2) return "bg-gray-400 text-black";
    if (rank === 3) return "bg-orange-500 text-black";
    return "bg-gray-600 text-white";
  };

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getColor()}`}>
      {rank}
    </div>
  );
}

interface ChangeIndicatorProps {
  change: number;
  changeType: 'up' | 'down' | 'same';
}

function ChangeIndicator({ change, changeType }: ChangeIndicatorProps) {
  const getIcon = () => {
    switch (changeType) {
      case "up": return <TrendingUp className="w-3 h-3 text-green-400" />;
      case "down": return <TrendingDown className="w-3 h-3 text-red-400" />;
      default: return <Minus className="w-3 h-3 text-gray-400" />;
    }
  };

  const getColor = () => {
    switch (changeType) {
      case "up": return "text-green-400";
      case "down": return "text-red-400";
      default: return "text-gray-400";
    }
  };

  return (
    <div className="flex items-center space-x-1">
      {getIcon()}
      <span className={`text-xs font-medium ${getColor()}`}>
        {change === 0 ? "0" : change > 0 ? `+${change}` : `${change}`}
      </span>
    </div>
  );
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  index: number;
}

function LeaderboardRow({ entry, index }: LeaderboardRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 ${
        entry.isCurrentUser 
          ? "bg-blue-500/20 border border-blue-400/30" 
          : "bg-white/5 hover:bg-white/10"
      }`}
    >
      <div className="flex items-center space-x-3">
        <RankBadge rank={entry.rank} />
        <div>
          <div className={`text-sm font-medium ${
            entry.isCurrentUser ? "text-blue-300" : "text-white"
          }`}>
            {entry.anonymizedName}
            {entry.isCurrentUser && (
              <span className="ml-2 text-xs text-blue-400">(You)</span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {entry.totalTrips} trips • {Math.round(entry.totalMiles)} mi
          </div>
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        <div className="text-right">
          <div className="text-lg font-bold text-white">{entry.score}</div>
        </div>
        <ChangeIndicator change={entry.change} changeType={entry.changeType} />
      </div>
    </motion.div>
  );
}

// ============================================================================
// PERIOD TABS
// ============================================================================

interface PeriodTabsProps {
  selected: 'weekly' | 'monthly' | 'all_time';
  onChange: (period: 'weekly' | 'monthly' | 'all_time') => void;
}

function PeriodTabs({ selected, onChange }: PeriodTabsProps) {
  const tabs = [
    { id: 'weekly' as const, label: 'This Week' },
    { id: 'monthly' as const, label: 'This Month' },
    { id: 'all_time' as const, label: 'All Time' },
  ];

  return (
    <div className="flex bg-white/5 rounded-xl p-1 mb-4">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            selected === tab.id 
              ? 'bg-gradient-to-r from-[#06B6D4] to-[#3B82F6] text-white' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [firebaseUserId, setFirebaseUserId] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Check demo mode
  useEffect(() => {
    const demoModeActive = sessionStorage.getItem('driiva-demo-mode') === 'true';
    if (demoModeActive) {
      setIsDemoMode(true);
    }
  }, []);

  // Get Firebase user ID
  useEffect(() => {
    if (isDemoMode) return;
    
    if (!isFirebaseConfigured || !auth) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setFirebaseUserId(firebaseUser.uid);
      }
    });

    return () => unsubscribe();
  }, [isDemoMode]);

  // Use community data hook
  const {
    pool,
    poolLoading,
    leaderboard,
    leaderboardLoading,
    leaderboardError,
    refresh,
    setLeaderboardPeriodType,
  } = useCommunityData(isDemoMode ? null : firebaseUserId);

  // Demo mode fallback data
  const demoLeaderboard: LeaderboardEntry[] = [
    { rank: 1, displayName: "speedracer42", anonymizedName: "speed***", score: 87, totalMiles: 1234, totalTrips: 45, change: -2, changeType: "down", isCurrentUser: false },
    { rank: 2, displayName: "safejenny", anonymizedName: "safej***", score: 85, totalMiles: 987, totalTrips: 38, change: 3, changeType: "up", isCurrentUser: false },
    { rank: 3, displayName: "carlover88", anonymizedName: "carlo***", score: 83, totalMiles: 856, totalTrips: 32, change: 0, changeType: "same", isCurrentUser: false },
    { rank: 4, displayName: "roadmaster", anonymizedName: "roadm***", score: 82, totalMiles: 765, totalTrips: 28, change: 7, changeType: "up", isCurrentUser: false },
    { rank: 5, displayName: "eco_driver", anonymizedName: "eco_d***", score: 81, totalMiles: 654, totalTrips: 24, change: -1, changeType: "down", isCurrentUser: false },
    { rank: 6, displayName: "nighthawk", anonymizedName: "night***", score: 80, totalMiles: 543, totalTrips: 20, change: 2, changeType: "up", isCurrentUser: false },
    { rank: 7, displayName: "citycommuter", anonymizedName: "cityc***", score: 79, totalMiles: 432, totalTrips: 18, change: -4, changeType: "down", isCurrentUser: false },
    { rank: 8, displayName: "highway_hero", anonymizedName: "highw***", score: 78, totalMiles: 321, totalTrips: 15, change: 1, changeType: "up", isCurrentUser: false },
    { rank: 9, displayName: "cruisecontrol", anonymizedName: "cruis***", score: 77, totalMiles: 289, totalTrips: 12, change: 0, changeType: "same", isCurrentUser: false },
    { rank: 10, displayName: "smoothrider", anonymizedName: "smoot***", score: 76, totalMiles: 234, totalTrips: 10, change: 3, changeType: "up", isCurrentUser: false },
    { rank: 11, displayName: "careful_kate", anonymizedName: "caref***", score: 75, totalMiles: 198, totalTrips: 8, change: -2, changeType: "down", isCurrentUser: false },
    { rank: 12, displayName: "autopilot_ai", anonymizedName: "autop***", score: 74, totalMiles: 167, totalTrips: 7, change: 4, changeType: "up", isCurrentUser: false },
    { rank: 13, displayName: "weekend_warrior", anonymizedName: "weeke***", score: 73, totalMiles: 145, totalTrips: 6, change: -1, changeType: "down", isCurrentUser: false },
    { rank: 14, displayName: "driiva1", anonymizedName: "driiv***", score: 72, totalMiles: 123, totalTrips: 5, change: 5, changeType: "up", isCurrentUser: true },
    { rank: 15, displayName: "slow_and_steady", anonymizedName: "slow_***", score: 72, totalMiles: 98, totalTrips: 4, change: 2, changeType: "up", isCurrentUser: false },
  ];

  const rankings = isDemoMode 
    ? demoLeaderboard 
    : (leaderboard?.rankings || []);

  const userRank = isDemoMode 
    ? 14 
    : (leaderboard?.userRank || null);

  const activeParticipants = isDemoMode 
    ? 1247 
    : (pool?.activeParticipants || leaderboard?.totalParticipants || 0);

  const avgScore = isDemoMode 
    ? 83.2 
    : (leaderboard?.averageScore || 0);

  const poolRefunds = isDemoMode 
    ? 127000 
    : (pool?.totalPoolPounds || 0);

  const periodLabel = isDemoMode 
    ? 'This Week' 
    : (leaderboard?.periodType === 'weekly' ? 'This Week' : 
       leaderboard?.periodType === 'monthly' ? 'This Month' : 'All Time');

  const handlePeriodChange = (period: 'weekly' | 'monthly' | 'all_time') => {
    setLeaderboardPeriodType(period);
  };

  return (
    <PageWrapper>
      <div className="pb-24 text-white">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link href="/dashboard">
                <button className="w-10 h-10 backdrop-blur-xl bg-white/10 border border-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all duration-200">
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-white">Community Leaderboard</h1>
                <p className="text-xs text-gray-300">
                  All Driivas • {periodLabel}
                  {leaderboard?.calculatedAt && !isDemoMode && (
                    <span className="text-gray-500 ml-1">
                      • Updated {new Date(leaderboard.calculatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {!isDemoMode && (
                <button
                  onClick={refresh}
                  className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                >
                  <RefreshCw className={`w-4 h-4 text-white ${leaderboardLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#06B6D4] to-[#3B82F6] flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </header>

        {/* Period Tabs */}
        {!isDemoMode && (
          <PeriodTabs 
            selected={leaderboard?.periodType || 'weekly'} 
            onChange={handlePeriodChange} 
          />
        )}

        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Card className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08]">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <span>{isDemoMode ? 'Weekly Challenge' : `${periodLabel} Challenge`}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {poolLoading && !isDemoMode ? (
                <StatsSkeleton />
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">
                      {activeParticipants.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-400">Active Drivers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">
                      {avgScore.toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-400">Avg Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-400">
                      £{Math.round(poolRefunds / 1000)}k
                    </div>
                    <div className="text-xs text-gray-400">Pool Refunds</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* User's Position Card (if not in top rankings) */}
        {userRank && userRank > 10 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4"
          >
            <Card className="backdrop-blur-xl bg-blue-500/10 border border-blue-500/30">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center">
                      <span className="text-blue-300 font-bold">#{userRank}</span>
                    </div>
                    <div>
                      <div className="text-blue-300 font-medium">Your Position</div>
                      <div className="text-xs text-blue-400/70">
                        {leaderboard?.userEntry?.totalTrips || 0} trips • {Math.round(leaderboard?.userEntry?.totalMiles || 0)} mi
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      {leaderboard?.userEntry?.score || 0}
                    </div>
                    {leaderboard?.userEntry && (
                      <ChangeIndicator 
                        change={leaderboard.userEntry.change} 
                        changeType={leaderboard.userEntry.changeType} 
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Rankings Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08]">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-white">
                <span>Rankings</span>
                <div className="text-xs text-gray-400">Score • Change</div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leaderboardLoading && !isDemoMode ? (
                <LeaderboardSkeleton />
              ) : leaderboardError && !isDemoMode ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                    <Trophy className="w-8 h-8 text-red-400/50" />
                  </div>
                  <p className="text-gray-400">Failed to load leaderboard</p>
                  <button
                    onClick={refresh}
                    className="mt-3 px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-all"
                  >
                    Try Again
                  </button>
                </div>
              ) : rankings.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-white/40" />
                  </div>
                  <p className="text-gray-400">No rankings yet this period</p>
                  <p className="text-gray-500 text-xs mt-1">Complete trips to appear on the leaderboard</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence mode="wait">
                    {rankings.map((entry, index) => (
                      <LeaderboardRow key={entry.rank} entry={entry} index={index} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
