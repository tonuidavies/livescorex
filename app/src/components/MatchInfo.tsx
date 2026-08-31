import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import type { MatchInfo as Info } from '../api/types';

/**
 * Match context: where it is being played, who is officiating, how many came.
 *
 * Coaches and injury lists were asked for and are not here — ESPN publishes
 * neither for football. Its per-team injuries endpoint returns an empty set for
 * every soccer league checked, and no coach appears on either the summary or
 * the team resource. Filling this block with a second provider is the fix; an
 * empty "Coaches" heading would just look broken.
 */
export function MatchInfoCard({ info }: { info: Info }) {
  const { colors } = useTheme();

  const rows: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; value: string }> = [];
  if (info.venue) {
    const where = [info.city, info.country].filter(Boolean).join(', ');
    rows.push({ icon: 'location-outline', label: 'Stadium', value: where ? `${info.venue}, ${where}` : info.venue });
  }
  if (info.referee) rows.push({ icon: 'person-outline', label: 'Referee', value: info.referee });
  if (info.attendance) {
    rows.push({ icon: 'people-outline', label: 'Attendance', value: info.attendance.toLocaleString() });
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
