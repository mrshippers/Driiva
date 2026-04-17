/**
 * Rewards — Driiva Mobile
 * Shows the 5-tier rewards timeline and community pool status.
 */
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const REWARDS = [
  { day: 'Day 5', title: 'Tesco £5 voucher', icon: 'cart-outline' as const, unlockScore: 70 },
  { day: 'Day 10', title: 'RAC trial membership', icon: 'car-outline' as const, unlockScore: 72 },
  { day: 'Team Driiva', title: 'Halfords £10 voucher', icon: 'build-outline' as const, unlockScore: 75 },
  { day: 'Month 3', title: '500 Nectar points', icon: 'star-outline' as const, unlockScore: 78 },
  { day: 'Anniversary', title: 'Amazon £25 voucher', icon: 'gift-outline' as const, unlockScore: 80 },
];

export default function Rewards() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Rewards Programme</Text>
        <Text style={styles.subtitle}>Drive safely, earn rewards. Score 70+ to unlock.</Text>

        <View style={styles.timeline}>
          {REWARDS.map((reward, i) => (
            <View key={reward.day} style={styles.rewardRow}>
              <View style={styles.timelineLeft}>
                <View style={styles.dot} />
                {i < REWARDS.length - 1 && <View style={styles.line} />}
              </View>
              <View style={styles.rewardCard}>
                <Ionicons name={reward.icon} size={24} color={Colors.primaryLight} />
                <View style={styles.rewardText}>
                  <Text style={styles.rewardDay}>{reward.day}</Text>
                  <Text style={styles.rewardTitle}>{reward.title}</Text>
                </View>
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 100 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.md },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.lg },

  timeline: { paddingLeft: Spacing.xs },
  rewardRow: { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { width: 24, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary, marginTop: 18 },
  line: { width: 2, flex: 1, backgroundColor: Colors.bgCardBorder, marginVertical: 2 },

  rewardCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.bgCardBorder, padding: Spacing.md, marginLeft: Spacing.sm, marginBottom: Spacing.sm,
  },
  rewardText: { flex: 1 },
  rewardDay: { fontSize: FontSize.xs, color: Colors.primaryLight, fontWeight: '700', textTransform: 'uppercase' },
  rewardTitle: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600', marginTop: 2 },
  lockBadge: { padding: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.bgElevated },
});
