/**
 * Driiva Design System — mobile
 * Brand language: italic bold wordmark, amber-to-indigo gradient, dark glassmorphic surfaces.
 * Extracted from brand assets (logo, app icon, splash).
 */

export const Colors = {
  // Core brand gradient (left → right: warm amber → deep indigo)
  amber: '#d4850a',
  amberLight: '#e8a640',
  indigo: '#3b2d8b',
  indigoDeep: '#1e1554',
  purple: '#6b3fa0',

  // Primary action (indigo from gradient)
  primary: '#5b4dc9',
  primaryLight: '#8b7de8',
  primaryDark: '#3b2d8b',

  // Accent (amber from gradient)
  accent: '#d4850a',
  accentLight: '#e8a640',

  // Backgrounds (dark, pulled from the deep end of the gradient)
  bg: '#0c0a1a',
  bgCard: 'rgba(255, 255, 255, 0.05)',
  bgCardBorder: 'rgba(255, 255, 255, 0.08)',
  bgElevated: 'rgba(255, 255, 255, 0.08)',
  bgInput: 'rgba(255, 255, 255, 0.06)',

  // Text
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textInverse: '#0f172a',

  // Semantic
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Score tiers
  scoreExcellent: '#22c55e',
  scoreGood: '#a3e635',
  scoreFair: '#f59e0b',
  scorePoor: '#ef4444',

  // Gradients (as arrays for LinearGradient)
  gradientBrand: ['#d4850a', '#a04c2a', '#6b3fa0', '#3b2d8b'] as const,
  gradientPrimary: ['#5b4dc9', '#8b7de8'] as const,
  gradientScore: ['#5b4dc9', '#22c55e'] as const,
  gradientBg: ['#0c0a1a', '#1e1554'] as const,
  gradientSurface: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)'] as const,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  xxxl: 36,
  display: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export function scoreColor(score: number): string {
  if (score >= 80) return Colors.scoreExcellent;
  if (score >= 60) return Colors.scoreGood;
  if (score >= 40) return Colors.scoreFair;
  return Colors.scorePoor;
}

/**
 * Glassmorphic card style (reusable)
 */
export const glassCard = {
  backgroundColor: Colors.bgCard,
  borderRadius: BorderRadius.lg,
  borderWidth: 1,
  borderColor: Colors.bgCardBorder,
} as const;
