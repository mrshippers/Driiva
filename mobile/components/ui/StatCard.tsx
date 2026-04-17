/**
 * StatCard — Single metric in a row of 3.
 *
 * Rule 2: Numbers are architecture. The number IS the design.
 * Rule 4: Tabular figures.
 * Rule 18: Generous internal padding.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, T, S, R, ROW } from './theme';

interface StatCardProps {
  label: string;
  value: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value }) => (
  <View style={styles.container}>
    <Text style={styles.value}>{value}</Text>
    <Text style={styles.label}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: ROW.stat,
    backgroundColor: C.surface1,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: S.sm,
  },
  value: {
    ...T.stat,
    color: C.text.hero,
  },
  label: {
    ...T.caption,
    color: C.text.mut,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default StatCard;
