import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import type { TeamStat, Team } from '../api/types';
import { Crest } from './Crest';

/**
 * Team stats. The wireframe shows bare numbers; the share bar underneath each
 * row is added because a possession split reads instantly as a bar and slowly
 * as two numbers.
 */
export function StatsTable({
  stats, home, away,
}: { stats: TeamStat[]; home: Team; away: Team }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <Crest uri={home.crest} name={home.name} size={22} />
        <Text style={[t.label, { color: colors.textMuted, flex: 1, textAlign: 'center' }]}>
          TEAM STATS
        </Text>
        <Crest uri={away.crest} name={away.name} size={22} />
      </View>

      {stats.map(s => (
        <View key={s.key} style={styles.row}>
          <View style={styles.values}>
            <Text style={[styles.value, { color: colors.text }]}>{s.home}</Text>
            <Text style={[t.body, { color: colors.textMuted, flex: 1, textAlign: 'center' }]}>
              {s.label}
            </Text>
            <Text style={[styles.value, { color: colors.text, textAlign: 'right' }]}>{s.away}</Text>
          </View>

          {s.homeShare !== null ? (
            <View style={[styles.track, { backgroundColor: colors.cardAlt }]}>
              <View
                style={{
                  width: `${Math.round(s.homeShare * 100)}%`,
                  backgroundColor: colors.accent,
                  height: '100%',
                  borderRadius: 2,
                }}
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingBottom: space.md,
  },
  row: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  values: { flexDirection: 'row', alignItems: 'center' },
  value: { width: 56, fontFamily: font.semibold, fontSize: 14.5 },
  track: { height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
});
