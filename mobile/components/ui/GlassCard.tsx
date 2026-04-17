/**
 * GlassCard — The foundational surface for Driiva.
 *
 * Matched to working app screenshots: darker purple-tinted glass,
 * not generic slate. Border is subtle but present. Shadow gives depth
 * without looking floaty.
 *
 * Every card in the app uses this. No exceptions.
 */
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';

type Padding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

const PAD: Record<Padding, number> = {
  none: 0,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
};

interface GlassCardProps {
  children: React.ReactNode;
  padding?: Padding;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Slightly brighter surface for nested/hover states */
  elevated?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  padding = 'md',
  style,
  onPress,
  elevated = false,
}) => {
  const cardStyle: ViewStyle[] = [
    styles.base,
    elevated ? styles.elevated : styles.default,
    { padding: PAD[padding] },
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={[cardStyle, style]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    borderWidth: 1,
    // Shadow: subtle, not floaty
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  default: {
    // Matches the working Driiva screenshots — deep purple-tinted glass
    backgroundColor: 'rgba(30, 20, 50, 0.55)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  elevated: {
    backgroundColor: 'rgba(40, 30, 60, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
});

export default GlassCard;
