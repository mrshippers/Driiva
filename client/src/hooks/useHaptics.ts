/**
 * Haptic feedback hook for native-feel touch interactions.
 * Uses Navigator.vibrate() where available, silent fallback otherwise.
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  selection: 8,
  success: [10, 30, 10],
  warning: [20, 40, 20],
  error: [30, 20, 30, 20, 30],
};

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function haptic(style: HapticStyle = 'light') {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[style]);
  } catch {
    // Silent — some browsers throw on vibrate in certain contexts
  }
}

export function useHaptics() {
  return {
    light: () => haptic('light'),
    medium: () => haptic('medium'),
    heavy: () => haptic('heavy'),
    selection: () => haptic('selection'),
    success: () => haptic('success'),
    warning: () => haptic('warning'),
    error: () => haptic('error'),
    haptic,
  };
}
