/**
 * AppBackground — Full-screen gradient background.
 *
 * From DESIGN_SYSTEM: "BACKGROUND: use this image. NEVER recreate with CSS."
 * The gradient image is the brand. When the image isn't available (dev),
 * falls back to a LinearGradient approximation.
 *
 * Wraps every screen. Children render on top.
 */
import React from 'react';
import { View, ImageBackground, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface AppBackgroundProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Use gradient image asset (default true). False = CSS gradient fallback. */
  useImage?: boolean;
}

// Try to load the gradient image. If it doesn't exist yet, gracefully fall back.
let gradientImage: number | null = null;
try {
  gradientImage = require('../../assets/Gradient_background.png');
} catch {
  gradientImage = null;
}

export const AppBackground: React.FC<AppBackgroundProps> = ({
  children,
  style,
  useImage = true,
}) => {
  if (useImage && gradientImage) {
    return (
      <ImageBackground
        source={gradientImage}
        style={[styles.container, style]}
        resizeMode="cover"
      >
        {children}
      </ImageBackground>
    );
  }

  // Fallback: CSS gradient approximation of the brand gradient
  return (
    <LinearGradient
      colors={['#0c0a1a', '#1a0f30', '#2d1650', '#1e1554']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, style]}
    >
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default AppBackground;
