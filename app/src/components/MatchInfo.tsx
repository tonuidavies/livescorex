import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import type { MatchInfo as Info } from '../api/types';

/**
 * Match context: where it is being played, who is officiating, how many came.
 *
 * Coaches arrive from the source that publishes them and are simply absent for
 * competitions covered only by the one that does not — the block renders what
 * exists rather than showing empty headings.
 *
 * Injury lists are still unavailable from either source.
 */
export function MatchInfoCard({ info }: { info: Info }) {
  const { colors } = useTheme();

  const rows: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; value: string }> = [];
  if (info.venue) {
    const where = [info.city, info.country].filter(Boolean).join(', ');
    rows.push({ icon: 'location-outline', label: 'Stadium', value: where ? `${info.venue}, ${where}` : info.venue });
  }
  if (info.homeCoach) rows.push({ icon: 'clipboard-outline', label: 'Home coach', value: info.homeCoach });
  if (info.awayCoach) rows.push({ icon: 'clipboard-outline', label: 'Away coach', value: info.awayCoach });
  if (info.referee) rows.push({ icon: 'person-outline', label: 'Referee', value: info.referee });
  if (info.attendance) {
    const cap = info.capacity
      ? `${info.attendance.toLocaleString()} of ${info.capacity.toLocaleString()}`
      : info.attendance.toLocaleString();
    rows.push({ icon: 'people-outline', label: 'Attendance', value: cap });
  } else if (info.capacity) {
    rows.push({ icon: 'people-outline', label: 'Capacity', value: info.capacity.toLocaleString() });
  }
  for (const o of info.officials.slice(0, 3)) {
    rows.push({ icon: 'flag-outline', label: 'Official', value: o });
  }

  if (rows.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {rows.map((r, i) => (
        <View
          key={`${r.label}-${i}`}
          style={[
            styles.row,
            {
              borderBottomColor: colors.divider,
              borderBottomWidth: i === rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
            },
          ]}
        >
          <Ionicons name={r.icon} size={16} color={colors.textMuted} />
          <Text style={[t.caption, { color: colors.textMuted, width: 78 }]}>{r.label}</Text>
          <Text style={[t.body, { color: colors.text, flex: 1 }]} numberOfLines={2}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: space.md, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
});
