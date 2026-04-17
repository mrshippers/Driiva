/**
 * DriivButton — Primary CTA with haptic feedback.
 *
 * Rule 1: Primary purple for interactive. No amber buttons.
 * Rule 11: Haptics on every press.
 */
import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { C, T, S, R } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface DriivButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Full width (default true) */
  block?: boolean;
}

export const DriivButton: React.FC<DriivButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  block = true,
}) => {
  const handlePress = () => {
    if (Platform.OS !== 'web') {
      try {
        const Haptics = require('expo-haptics');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
    onPress();
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variantStyles[variant],
        block && styles.block,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'ghost' || variant === 'secondary' ? C.primary : C.text.hero}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'ghost' && styles.textGhost,
            variant === 'secondary' && styles.textSecondary,
            variant === 'danger' && styles.textDanger,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: 16,
    paddingHorizontal: S.lg,
    borderRadius: R.card,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  block: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text.hero,
  },
  textGhost: {
    color: C.primary,
  },
  textSecondary: {
    color: C.primary,
  },
  textDanger: {
    color: '#fff',
  },
});

const variantStyles: Record<Variant, ViewStyle> = {
  primary: {
    backgroundColor: C.primary,
  },
  secondary: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: C.error,
  },
};

export default DriivButton;
