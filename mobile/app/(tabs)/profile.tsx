/**
 * Profile — Driiva Mobile
 */
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profile</Text>

        {/* User info */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? 'D'}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? 'Driver'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Menu items */}
        <View style={styles.card}>
          <MenuItem icon="settings-outline" label="Settings" onPress={() => {}} />
          <MenuItem icon="car-outline" label="Vehicle" onPress={() => {}} />
          <MenuItem icon="shield-checkmark-outline" label="Policy" onPress={() => {}} />
          <MenuItem icon="trophy-outline" label="Achievements" onPress={() => {}} />
          <MenuItem icon="bar-chart-outline" label="Leaderboard" onPress={() => {}} />
          <MenuItem icon="help-circle-outline" label="Support" onPress={() => {}} />
        </View>

        {/* Legal */}
        <View style={styles.card}>
          <MenuItem icon="document-text-outline" label="Privacy Policy" onPress={() => {}} />
          <MenuItem icon="document-outline" label="Terms of Service" onPress={() => {}} />
          <MenuItem icon="shield-outline" label="Trust Centre" onPress={() => {}} />
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Driiva v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={20} color={Colors.textSecondary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 100 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.md, marginBottom: Spacing.md },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.bgCardBorder, padding: Spacing.md, marginBottom: Spacing.md,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: Spacing.sm,
  },
  avatarText: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  name: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  email: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: 2 },

  menuItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  menuLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, marginLeft: Spacing.sm },

  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: Spacing.sm,
  },
  logoutText: { fontSize: FontSize.md, color: Colors.error, fontWeight: '600' },

  version: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },
});
