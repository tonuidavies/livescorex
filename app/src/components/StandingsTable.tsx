import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import type { StandingRow } from '../api/types';
import { Crest } from './Crest';

/**
 * League table. `highlight` picks out the teams in the match you came from,
 * which is the whole reason this tab exists on the detail screen.
 */
export function StandingsTable({
  rows, highlight = [], onPressTeam,
}: {
  rows: StandingRow[];
  highlight?: string[];
  onPressTeam?: (teamId: string) => void;
}) {
  const { colors } = useTheme();

  const markerColor = (row: StandingRow, index: number): string | null => {
    if (row.marker === 'relegation') return colors.markerRelegation;
    if (row.marker === 'promotion') return colors.markerPromotion;
    if (row.marker === 'europe') return colors.markerEurope;
    // Sources rarely supply markers; fall back to the usual shape of a
    // top-flight table so the edge bars are not simply missing.
    if (index < 4) return colors.markerEurope;
    if (index >= rows.length - 3) return colors.markerRelegation;
    return null;
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.card, { borderColor: colors.border }]}>
        <View style={[styles.headRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.h, styles.rank, { color: colors.textMuted }]}>#</Text>
          <Text style={[styles.h, styles.team, { color: colors.textMuted }]}>Team</Text>
          {['M', 'W', 'D', 'L', 'GD'].map(k => (
            <Text key={k} style={[styles.h, styles.num, { color: colors.textMuted }]}>{k}</Text>
          ))}
          <Text style={[styles.h, styles.pts, { color: colors.textMuted }]}>PTS</Text>
        </View>

        {rows.map((r, i) => {
          const on = highlight.includes(r.team.id);
          const marker = markerColor(r, i);
          return (
            <Pressable
              key={`${r.team.id}-${r.rank}`}
              onPress={() => onPressTeam?.(r.team.id)}
              disabled={!onPressTeam}
              style={[
                styles.row,
                {
                  backgroundColor: on ? colors.cardAlt : i % 2 ? colors.card : 'transparent',
                  borderBottomColor: colors.divider,
                },
              ]}
            >
              <View style={[styles.edge, { backgroundColor: marker ?? 'transparent' }]} />
              <Text style={[styles.cell, styles.rank, { color: colors.text }]}>{r.rank}</Text>
              <View style={[styles.team, styles.teamCell]}>
                <Crest uri={r.team.crest} name={r.team.name} size={18} />
                <Text
                  style={[t.body, { color: colors.text, flex: 1, fontFamily: on ? font.semibold : font.regular }]}
                  numberOfLines={1}
                >
                  {r.team.name}
                </Text>
              </View>
              <Text style={[styles.cell, styles.num, { color: colors.text }]}>{r.played}</Text>
              <Text style={[styles.cell, styles.num, { color: colors.text }]}>{r.wins}</Text>
              <Text style={[styles.cell, styles.num, { color: colors.text }]}>{r.draws}</Text>
              <Text style={[styles.cell, styles.num, { color: colors.text }]}>{r.losses}</Text>
              <Text style={[styles.cell, styles.num, { color: colors.text }]}>
                {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
              </Text>
              <Text style={[styles.cell, styles.pts, { color: colors.text, fontFamily: font.bold }]}>
                {r.points}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: space.md, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', minWidth: 360,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  h: { fontFamily: font.medium, fontSize: 12 },
  cell: { fontFamily: font.regular, fontSize: 13.5 },
  rank: { width: 34, textAlign: 'center' },
  team: { width: 168 },
  teamCell: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: space.sm },
  num: { width: 32, textAlign: 'center' },
  pts: { width: 44, textAlign: 'center' },
});
