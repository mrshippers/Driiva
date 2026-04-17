/**
 * TripCard — Single trip row in lists.
 *
 * Rule 3: Fixed 72px row height. No exceptions.
 * Rule 4: Tabular figures on score and metrics.
 * Rule 6: Score colour earned through data only.
 * Rule 13: Skeleton loading state matches layout exactly.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, T, S, R, ROW, scoreColor } from './theme';

interface Trip {
  id?: string;
  score: number;
  distanceMeters: number;
  durationSeconds: number;
  routeSummary: string;
  startedAt: string;
}

interface TripCardProps {
  trip: Trip;
  onPress?: () => void;
}

export const TripCard: React.FC<TripCardProps> = ({ trip, onPress }) => {
  const miles = (trip.distanceMeters / 1609.34).toFixed(1);
  const mins = Math.round(trip.durationSeconds / 60);
  const color = scoreColor(trip.score);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={!onPress}
    >
      {/* Route icon */}
      <View style={styles.iconWrap}>
        <Ionicons name="navigate-outline" size={18} color={C.text.sec} />
      </View>

      {/* Route info */}
      <View style={styles.info}>
        <Text style={styles.route} numberOfLines={1}>
          {trip.routeSummary || 'Trip'}
        </Text>
        <Text style={styles.meta}>
          {miles} mi  ·  {mins} min
        </Text>
      </View>

      {/* Score badge */}
      <View style={[styles.scoreBadge, { borderColor: color }]}>
        <Text style={[styles.scoreText, { color }]}>{trip.score}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW.trip,
    paddingHorizontal: S.md,
    backgroundColor: C.surface1,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: S.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: S.md,
  },
  info: {
    flex: 1,
  },
  route: {
    ...T.label,
    color: C.text.pri,
  },
  meta: {
    ...T.caption,
    color: C.text.mut,
    marginTop: 2,
  },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

export default TripCard;
