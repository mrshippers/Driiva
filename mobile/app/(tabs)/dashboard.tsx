/**
 * Dashboard — Driiva Mobile
 * The main screen users see after login.
 * Shows: safety score ring, recent trips, quick stats, community pool.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius, scoreColor } from '@/constants/theme';

const { width } = Dimensions.get('window');

interface DashboardData {
  overallScore: number;
  totalTrips: number;
  totalMiles: number;
  scoreBreakdown: {
    speedScore: number;
    brakingScore: number;
    accelerationScore: number;
    corneringScore: number;
    phoneUsageScore: number;
  };
  recentTrips: Array<{
    id: string;
    score: number;
    distanceMeters: number;
    durationSeconds: number;
    startedAt: string;
    routeSummary?: string;
  }>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    // Real-time listener on user document
    const unsubscribe = firestore()
      .collection('users')
      .doc(user.id)
      .onSnapshot((doc) => {
        const userData = doc.data();
        if (!userData) return;

        const profile = userData.drivingProfile || {};
        setData({
          overallScore: profile.overallSafetyScore ?? 0,
          totalTrips: profile.totalTrips ?? 0,
          totalMiles: profile.totalMiles ?? 0,
          scoreBreakdown: profile.scoreBreakdown ?? {
            speedScore: 0, brakingScore: 0, accelerationScore: 0,
            corneringScore: 0, phoneUsageScore: 100,
          },
          recentTrips: userData.recentTrips ?? [],
        });
      });

    return unsubscribe;
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Firestore listener auto-updates, just show the indicator briefly
    setTimeout(() => setRefreshing(false), 1000);
  };

  const score = data?.overallScore ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Hey, {user?.name?.split(' ')[0] ?? 'Driver'}</Text>
          <Text style={styles.subtitle}>Your driving dashboard</Text>
        </View>

        {/* Score Ring */}
        <View style={styles.scoreCard}>
          <View style={[styles.scoreRing, { borderColor: scoreColor(score) }]}>
            <Text style={[styles.scoreNumber, { color: scoreColor(score) }]}>{score}</Text>
            <Text style={styles.scoreLabel}>Safety Score</Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <StatCard label="Trips" value={String(data?.totalTrips ?? 0)} />
          <StatCard label="Miles" value={String(Math.round(data?.totalMiles ?? 0))} />
          <StatCard label="Rank" value="--" />
        </View>

        {/* Score Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Score Breakdown</Text>
          <ScoreBar label="Speed" value={data?.scoreBreakdown.speedScore ?? 0} weight="25%" />
          <ScoreBar label="Braking" value={data?.scoreBreakdown.brakingScore ?? 0} weight="25%" />
          <ScoreBar label="Acceleration" value={data?.scoreBreakdown.accelerationScore ?? 0} weight="20%" />
          <ScoreBar label="Cornering" value={data?.scoreBreakdown.corneringScore ?? 0} weight="20%" />
          <ScoreBar label="Phone" value={data?.scoreBreakdown.phoneUsageScore ?? 100} weight="10%" />
        </View>

        {/* Recent Trips */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Trips</Text>
          {(data?.recentTrips?.length ?? 0) === 0 ? (
            <Text style={styles.emptyText}>No trips yet. Start driving to see your score!</Text>
          ) : (
            data?.recentTrips.slice(0, 5).map((trip) => (
              <View key={trip.id} style={styles.tripRow}>
                <View>
                  <Text style={styles.tripRoute}>{trip.routeSummary || 'Trip'}</Text>
                  <Text style={styles.tripMeta}>
                    {(trip.distanceMeters / 1609.34).toFixed(1)} mi · {Math.round(trip.durationSeconds / 60)} min
                  </Text>
                </View>
                <Text style={[styles.tripScore, { color: scoreColor(trip.score) }]}>{trip.score}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ScoreBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  return (
    <View style={styles.scoreBarRow}>
      <View style={styles.scoreBarLabel}>
        <Text style={styles.scoreBarText}>{label}</Text>
        <Text style={styles.scoreBarWeight}>{weight}</Text>
      </View>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${value}%`, backgroundColor: scoreColor(value) }]} />
      </View>
      <Text style={[styles.scoreBarValue, { color: scoreColor(value) }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 100 },
  header: { marginTop: Spacing.md, marginBottom: Spacing.lg },
  greeting: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: 2 },

  scoreCard: { alignItems: 'center', marginBottom: Spacing.lg },
  scoreRing: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 6, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.bgCard,
  },
  scoreNumber: { fontSize: FontSize.display, fontWeight: '900' },
  scoreLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: -4 },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1, backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.md, alignItems: 'center',
  },
  statValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.md, marginBottom: Spacing.md,
  },
  cardTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  scoreBarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  scoreBarLabel: { width: 90, flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreBarText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  scoreBarWeight: { fontSize: FontSize.xs, color: Colors.textMuted },
  scoreBarTrack: { flex: 1, height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, marginHorizontal: Spacing.sm },
  scoreBarFill: { height: 6, borderRadius: 3 },
  scoreBarValue: { width: 30, textAlign: 'right', fontSize: FontSize.sm, fontWeight: '700' },

  tripRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  tripRoute: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  tripMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  tripScore: { fontSize: FontSize.xl, fontWeight: '800' },

  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },
});
