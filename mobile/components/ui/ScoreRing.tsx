/**
 * ScoreRing — Animated radial gauge with brand gradient stroke.
 *
 * The hero component. From your working screenshots: the ring uses the
 * amber→indigo brand gradient as the stroke, animates on mount,
 * and fires haptics on completion.
 *
 * Sizes: sm (44px, trip cards), md (80px, inline), lg (130px, dashboard hero).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated as A, Platform } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

const AnimatedCircle = A.createAnimatedComponent(Circle);

// Brand gradient stops (from your logo: amber → burnt → violet → indigo)
const GRADIENT_STOPS = [
  { offset: '0%', color: '#d4850a' },
  { offset: '33%', color: '#a04c2a' },
  { offset: '66%', color: '#6b3fa0' },
  { offset: '100%', color: '#3b2d8b' },
];

const SIZES = {
  sm: { diameter: 44, stroke: 3, showLabel: false, fontSize: 14, fontWeight: '700' as const },
  md: { diameter: 80, stroke: 5, showLabel: true, fontSize: 24, fontWeight: '700' as const },
  lg: { diameter: 130, stroke: 7, showLabel: true, fontSize: 38, fontWeight: '800' as const },
} as const;

interface ScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  /** Override the default "/ 100" subtitle */
  subtitle?: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 'lg',
  animated = true,
  subtitle = '/ 100',
}) => {
  const cfg = SIZES[size];
  const radius = (cfg.diameter - cfg.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const center = cfg.diameter / 2;

  const fillAnim = useRef(new A.Value(circumference)).current;
  const counterAnim = useRef(new A.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(animated ? 0 : score);

  useEffect(() => {
    if (!animated) {
      fillAnim.setValue(circumference * (1 - pct));
      setDisplayScore(score);
      return;
    }

    // Reset and animate
    fillAnim.setValue(circumference);
    counterAnim.setValue(0);

    A.parallel([
      A.timing(fillAnim, {
        toValue: circumference * (1 - pct),
        duration: 900,
        useNativeDriver: false,
      }),
      A.timing(counterAnim, {
        toValue: score,
        duration: 900,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Haptic on animation complete
      if (Platform.OS !== 'web') {
        try {
          const Haptics = require('expo-haptics');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
    });

    const listener = counterAnim.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });

    return () => counterAnim.removeListener(listener);
  }, [score, animated]);

  return (
    <View style={{ width: cfg.diameter, height: cfg.diameter, alignSelf: 'center' }}>
      <Svg width={cfg.diameter} height={cfg.diameter}>
        <Defs>
          <LinearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            {GRADIENT_STOPS.map((s, i) => (
              <Stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>
        </Defs>

        {/* Track (background circle) */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255, 255, 255, 0.06)"
          strokeWidth={cfg.stroke}
          fill="transparent"
        />

        {/* Fill (animated, gradient stroke) */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#scoreGrad)"
          strokeWidth={cfg.stroke}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={fillAnim}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>

      {/* Center text overlay */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={styles.center}>
          <Text
            style={[
              styles.scoreText,
              { fontSize: cfg.fontSize, fontWeight: cfg.fontWeight },
            ]}
          >
            {displayScore}
          </Text>
          {cfg.showLabel && (
            <Text style={styles.subtitleText}>{subtitle}</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    color: '#fff',
    letterSpacing: -1,
  },
  subtitleText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: -2,
  },
});

export default ScoreRing;
