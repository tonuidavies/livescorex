import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, tabular, type as t, font } from '../theme';
import type { Forecast, Team } from '../api/types';

/**
 * Model forecast.
 *
 * Presented as a model rather than an oracle: the confidence grade, the
 * inputs it used and its blind spots are all on screen. A prediction UI that
 * shows only a big percentage invites more trust than a league table can
 * justify, and this one is honest about resting on goals scored and conceded
 * and nothing else.
 */
export function ForecastCard({
  forecast, home, away,
}: { forecast: Forecast; home: Team; away: Team }) {
  const { colors } = useTheme();

  const pct = (n: number) => Math.round(n * 100);
  const bars = [
    { key: 'home', label: home.shortName || home.name, v: forecast.home, c: colors.accent },
    { key: 'draw', label: 'Draw', v: forecast.draw, c: colors.textDim },
    { key: 'away', label: away.shortName || away.name, v: forecast.away, c: '#3E6DD1' },
  ];

  const confTone =
    forecast.confidence === 'high' ? colors.markerPromotion
    : forecast.confidence === 'medium' ? colors.stale
    : colors.redCard;

  return (
    <View style={{ paddingBottom: space.md }}>
      <View style={styles.titleRow}>
        <Text style={[t.label, { color: colors.textMuted }]}>
          {forecast.inPlay ? 'FORECAST · FROM HERE' : 'FORECAST'}
        </Text>
        <View style={[styles.confPill, { borderColor: confTone }]}>
          <View style={[styles.confDot, { backgroundColor: confTone }]} />
          <Text style={[t.caption, { color: confTone }]}>
            {forecast.confidence} confidence
          </Text>
        </View>
      </View>

      {/* One stacked bar rather than three: the split is the story. */}
      <View style={[styles.stack, { backgroundColor: colors.cardAlt }]}>
        {bars.map(b => (
          <View key={b.key} style={{ flex: Math.max(0.001, b.v), backgroundColor: b.c }} />
        ))}
      </View>

      <View style={styles.legend}>
        {bars.map(b => (
          <View key={b.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: b.c }]} />
            <Text style={[t.caption, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
              {b.label}
            </Text>
            <Text style={[t.bodyMed, tabular, { color: colors.text }]}>{pct(b.v)}%</Text>
          </View>
        ))}
      </View>

      <View style={styles.metrics}>
        <Metric label="Goals" value={`${forecast.expected.home.toFixed(1)} – ${forecast.expected.away.toFixed(1)}`} />
        <Metric label="Both score" value={`${pct(forecast.bothTeamsScore)}%`} />
        <Metric label="Over 2.5" value={`${pct(forecast.overTwoFive)}%`} />
      </View>

      <Text style={[t.label, styles.sub, { color: colors.textMuted }]}>LIKELY SCORES</Text>
      <View style={[styles.scoreRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {forecast.scorelines.map((s, i) => (
          <View key={i} style={styles.scoreCell}>
            <Text style={[t.h3, tabular, { color: colors.text }]}>
              {s.home}–{s.away}
            </Text>
            <Text style={[t.caption, tabular, { color: colors.textMuted }]}>{pct(s.p)}%</Text>
          </View>
        ))}
      </View>

      <Text style={[t.label, styles.sub, { color: colors.textMuted }]}>WHAT IT USED</Text>
      <View style={[styles.basis, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {forecast.basis.map((b, i) => (
          <View key={i} style={styles.basisRow}>
            <View style={[styles.bullet, { backgroundColor: colors.textDim }]} />
            <Text style={[t.caption, { color: colors.textMuted, flex: 1 }]}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={styles.caveat}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textDim} />
        <Text style={[t.caption, { color: colors.textDim, flex: 1 }]}>
          A goals model built from league form. It knows nothing about injuries,
          suspensions or team news.
        </Text>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[t.bodyMed, tabular, { color: colors.text }]}>{value}</Text>
      <Text style={[t.caption, { color: colors.textMuted, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.sm,
  },
  confPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: space.sm, paddingVertical: 3,
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  confDot: { width: 6, height: 6, borderRadius: 3 },
  stack: {
    flexDirection: 'row', height: 10, marginHorizontal: space.md,
    borderRadius: 5, overflow: 'hidden',
  },
  legend: { paddingHorizontal: space.md, paddingTop: space.md, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  metrics: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.lg },
  metric: {
    flex: 1, alignItems: 'center', paddingVertical: space.md,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth,
  },
  sub: { paddingHorizontal: space.md, paddingTop: space.xl, paddingBottom: space.sm },
  scoreRow: {
    flexDirection: 'row', marginHorizontal: space.md,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingVertical: space.md,
  },
  scoreCell: { flex: 1, alignItems: 'center', gap: 2 },
  basis: {
    marginHorizontal: space.md, borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm,
  },
  basisRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bullet: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  caveat: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: space.md, paddingTop: space.md,
  },
});
