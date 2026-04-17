/**
 * ScoreBreakdownBar — One scoring dimension as a labelled progress bar.
 *
 * Rule 6: Score colours earned through data only.
 * Rule 4: Tabular figures on the value.
 * Research: 8px bar height, 4px radius (thicker = more substantial).
 * Research: Drop the weight% — it adds cognitive load without actionable info.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, T, S, scoreColor } from './theme';

interface ScoreBreakdownBarProps {
  label: string;
  value: number;
}

export const ScoreBreakdownBar: React.FC<ScoreBreakdownBarProps> = ({ label, value }) => {
  const color = scoreColor(value);
  const width = `${Math.min(Math.max(value, 0), 100)}%`;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: width as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    width: 88,
    ...T.caption,
    color: C.text.sec,
  },
  track: {
    flex: 1,
    height: 8,
    backgroundColor: C.surface2,
    borderRadius: 4,
    marginHorizontal: S.sm,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  value: {
    width: 28,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

export default ScoreBreakdownBar;
