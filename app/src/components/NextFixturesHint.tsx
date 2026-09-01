import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import { api } from '../api/client';

/**
 * "Nothing today — here's when there is something."
 *
 * An empty day is the normal state for most sports most of the time: on the
 * first of September the NBA, NFL and NHL are all weeks from starting. Showing
 * only "no matches" makes a closed season look like a broken app, so this
 * finds the next day that has fixtures and offers to go there.
 */
export function NextFixturesHint({
  sport, from, onJump,
}: { sport: string; from: string; onJump: (day: string) => void }) {
  const { colors } = useTheme();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'none' }
    | { kind: 'found'; day: string; count: number; league: string }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    api.nextFixtures(sport, from)
      .then(r => {
        if (cancelled) return;
        setState(r.next ? { kind: 'found', ...r.next } : { kind: 'none' });
      })
      .catch(() => { if (!cancelled) setState({ kind: 'none' }); });
    return () => { cancelled = true; };
  }, [sport, from]);

  if (state.kind === 'loading') {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator size="small" color={colors.textDim} />
      </View>
    );
  }

  if (state.kind === 'none') {
    return (
      <View style={styles.wrap}>
        <Text style={[t.caption, { color: colors.textDim, textAlign: 'center' }]}>
          Nothing scheduled in the next ten days either — this competition is
          likely between seasons.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onJump(state.day)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? colors.cardAlt : colors.card, borderColor: colors.accent },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Jump to ${prettyDay(state.day)}, ${state.count} matches`}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[t.bodyMed, { color: colors.text }]}>
            Next: {prettyDay(state.day)}
          </Text>
          <Text style={[t.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {state.count} {state.count === 1 ? 'match' : 'matches'} · {state.league}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.accent} />
      </Pressable>
    </View>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prettyDay(key: string): string {
  const d = new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(4, 6)) - 1,
    Number(key.slice(6, 8)),
  );
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.xl, paddingBottom: space.xxl, alignItems: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
});
