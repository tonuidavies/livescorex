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
/**
 * Team stats, sectioned when the source groups them.
 *
 * One feed returns eight labelled sections (Top stats, Shots, xG, Passes,
 * Defence, Duels, Discipline…) and the other a flat ten; rendering both the
 * same way would either lose the structure or invent it, so grouping is driven
 * by the data.
 *
 * The split bar grows from the centre outwards rather than filling
 * left-to-right, which is what makes a 39/61 possession split legible without
 * reading either number.
 */
export function StatsTable({
  stats, home, away,
}: { stats: TeamStat[]; home: Team; away: Team }) {
  const { colors } = useTheme();

  const sections: Array<{ title: string | null; rows: TeamStat[] }> = [];
  for (const s of stats) {
    const last = sections[sections.length - 1];
    if (last && last.title === s.group) last.rows.push(s);
    else sections.push({ title: s.group, rows: [s] });
  }

  return (
    <View style={{ paddingBottom: space.md }}>
      <View style={[styles.teamsBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.teamSide}>
          <Crest uri={home.crest} name={home.name} size={20} />
          <Text style={[t.label, { color: colors.text, flex: 1 }]} numberOfLines={1}>
            {home.name}
          </Text>
        </View>
        <View style={[styles.teamSide, { justifyContent: 'flex-end' }]}>
          <Text style={[t.label, { color: colors.text, flex: 1, textAlign: 'right' }]} numberOfLines={1}>
            {away.name}
          </Text>
          <Crest uri={away.crest} name={away.name} size={20} />
        </View>
      </View>

      {sections.map((sec, i) => (
        <View key={`${sec.title ?? 'flat'}-${i}`}>
          {sec.title ? (
            <Text style={[t.label, styles.sectionTitle, { color: colors.textMuted }]}>
              {sec.title.toUpperCase()}
            </Text>
          ) : null}

          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {sec.rows.map((s, j) => (
              <View
                key={s.key}
                style={[
                  styles.row,
                  j < sec.rows.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.divider,
                  },
                ]}
              >
                <View style={styles.values}>
                  <Text style={[styles.value, { color: colors.text }]}>{s.home}</Text>
                  <Text style={[t.caption, { color: colors.textMuted, flex: 1, textAlign: 'center' }]}>
                    {s.label}
                  </Text>
                  <Text style={[styles.value, { color: colors.text, textAlign: 'right' }]}>
                    {s.away}
                  </Text>
                </View>

                {s.homeShare !== null ? (
                  <View style={styles.splitTrack}>
                    <View style={styles.splitHalf}>
                      <View
                        style={{
                          width: `${Math.round(s.homeShare * 100)}%`,
                          backgroundColor: colors.accent,
                          height: '100%',
                          borderTopLeftRadius: 2,
                          borderBottomLeftRadius: 2,
                        }}
                      />
                    </View>
                    <View style={[styles.splitHalf, { alignItems: 'flex-start' }]}>
                      <View
                        style={{
                          width: `${Math.round((1 - s.homeShare) * 100)}%`,
                          backgroundColor: colors.textDim,
                          height: '100%',
                          borderTopRightRadius: 2,
                          borderBottomRightRadius: 2,
                        }}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  teamsBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: space.md, marginTop: space.md,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, gap: space.md,
  },
  teamSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionTitle: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm },
  row: { paddingHorizontal: space.lg, paddingVertical: space.md },
  values: { flexDirection: 'row', alignItems: 'center' },
  value: { width: 54, fontFamily: font.semibold, fontSize: 14.5 },
  splitTrack: { flexDirection: 'row', height: 4, marginTop: 9, gap: 2 },
  splitHalf: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
});
