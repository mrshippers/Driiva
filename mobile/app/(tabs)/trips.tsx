/**
 * Trips List — Driiva Mobile
 */
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius, scoreColor } from '@/constants/theme';

interface Trip {
  id: string;
  score: number;
  distanceMeters: number;
  durationSeconds: number;
  startedAt: { toDate?: () => Date } | string;
  routeSummary?: string;
  status: string;
}

export default function Trips() {
  const { user } = useAuth();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = firestore()
      .collection('trips')
      .where('userId', '==', user.id)
      .where('status', '==', 'completed')
      .orderBy('startedAt', 'desc')
      .limit(50)
      .onSnapshot((snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Trip));
        setTrips(list);
      });

    return unsubscribe;
  }, [user?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const formatDate = (ts: Trip['startedAt']) => {
    const date = typeof ts === 'string' ? new Date(ts) : ts?.toDate?.() ?? new Date();
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Your Trips</Text>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No trips yet. Hit the record button to start your first drive!</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/trips/${item.id}`)}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.route}>{item.routeSummary || 'Trip'}</Text>
              <Text style={styles.meta}>
                {(item.distanceMeters / 1609.34).toFixed(1)} mi · {Math.round(item.durationSeconds / 60)} min
              </Text>
              <Text style={styles.date}>{formatDate(item.startedAt)}</Text>
            </View>
            <View style={[styles.scoreBadge, { borderColor: scoreColor(item.score) }]}>
              <Text style={[styles.scoreText, { color: scoreColor(item.score) }]}>{item.score}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 100 },
  empty: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.xxl },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.bgCardBorder, padding: Spacing.md, marginBottom: Spacing.sm,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  cardLeft: { flex: 1 },
  route: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  date: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  scoreBadge: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bgCard,
  },
  scoreText: { fontSize: FontSize.lg, fontWeight: '900' },
});
