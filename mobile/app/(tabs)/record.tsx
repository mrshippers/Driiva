/**
 * Record Trip — Driiva Mobile
 * In the Damoov model, trip recording is automatic (SDK handles background GPS).
 * This screen shows recording status and allows manual trip start/stop as fallback.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

type RecordingState = 'idle' | 'recording' | 'processing';

export default function Record() {
  const [state, setState] = useState<RecordingState>('idle');

  const handleToggle = () => {
    if (state === 'idle') {
      setState('recording');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      // TODO: Start Damoov manual tracking or fallback GPS
    } else if (state === 'recording') {
      setState('processing');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // TODO: Stop tracking, trigger trip processing
      setTimeout(() => setState('idle'), 3000);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>
          {state === 'idle' ? 'Ready to Drive' : state === 'recording' ? 'Recording Trip' : 'Processing...'}
        </Text>
        <Text style={styles.subtitle}>
          {state === 'idle'
            ? 'Damoov auto-detects your trips.\nTap below for manual recording.'
            : state === 'recording'
            ? 'Drive safely. Your score is being tracked.'
            : 'Calculating your driving score...'}
        </Text>

        <TouchableOpacity
          style={[
            styles.recordButton,
            state === 'recording' && styles.recordButtonActive,
            state === 'processing' && styles.recordButtonProcessing,
          ]}
          onPress={handleToggle}
          disabled={state === 'processing'}
          activeOpacity={0.8}
        >
          <Ionicons
            name={state === 'idle' ? 'play' : state === 'recording' ? 'stop' : 'hourglass-outline'}
            size={48}
            color={Colors.textPrimary}
          />
        </TouchableOpacity>

        <Text style={styles.hint}>
          {state === 'idle' ? 'Tap to start manual recording' : state === 'recording' ? 'Tap to end trip' : ''}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.lg },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },
  recordButton: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    marginVertical: Spacing.xxl,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 12,
  },
  recordButtonActive: { backgroundColor: Colors.error },
  recordButtonProcessing: { backgroundColor: Colors.warning, opacity: 0.7 },
  hint: { fontSize: FontSize.sm, color: Colors.textMuted },
});
