import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable, SectionList, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import { api } from '../api/client';
import { usePrefs } from '../store/prefs';
import { Crest, LeagueCrest } from '../components/Crest';
import { Star } from '../components/Star';
import { dayKeyUTC } from '../util/format';
import type { League, Match } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

/** Searches the league catalogue and the teams playing across the next few days. */
export function SearchScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isLeague, toggleLeague, isTeam, toggleTeam } = usePrefs();

  const [q, setQ] = useState('');
  const [leagues, setLeagues] = useState<League[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    api.leagues().then(r => setLeagues(r.leagues)).catch(() => {});
    // Teams are not a separate resource; harvest them from the days we have.
    const days = [0, 1, 2].map(i => dayKeyUTC(new Date(Date.now() + i * 86_400_000)));
    Promise.all(days.map(d => api.matches(d).catch(() => null)))
      .then(rs => {
        const all: Match[] = [];
        for (const r of rs) for (const g of r?.groups ?? []) all.push(...g.matches);
        setMatches(all);
      })
      .catch(() => {});
  }, []);

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];

    const leagueHits = leagues
      .filter(l => l.name.toLowerCase().includes(needle) || l.countryName.toLowerCase().includes(needle))
      .slice(0, 12);

    const seen = new Set<string>();
    const teamHits: Array<{ id: string; name: string; crest: string | null; league: League }> = [];
    for (const m of matches) {
      for (const team of [m.home, m.away]) {
        if (seen.has(team.id)) continue;
        if (!team.name.toLowerCase().includes(needle)) continue;
        seen.add(team.id);
        teamHits.push({ id: team.id, name: team.name, crest: team.crest, league: m.league });
      }
    }

    const out: Array<{ title: string; kind: 'league' | 'team'; data: any[] }> = [];
    if (teamHits.length) out.push({ title: 'TEAMS', kind: 'team', data: teamHits.slice(0, 20) });
    if (leagueHits.length) out.push({ title: 'COMPETITIONS', kind: 'league', data: leagueHits });
    return out;
  }, [q, leagues, matches]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={[styles.search, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Teams, leagues, countries"
            placeholderTextColor={colors.textDim}
            style={[t.body, { color: colors.text, flex: 1, paddingVertical: 0 }]}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={17} color={colors.textDim} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id ?? item.slug}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        renderSectionHeader={({ section }) => (
          <Text style={[t.label, styles.sectionHeader, { color: colors.textMuted }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, section }) =>
          section.kind === 'league' ? (
            <Pressable
              style={[styles.row, { backgroundColor: colors.card }]}
              onPress={() => navigation.navigate('Table', { leagueSlug: item.slug })}
            >
              <LeagueCrest league={item} size={26} />
              <View style={{ flex: 1 }}>
                <Text style={[t.bodyMed, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[t.caption, { color: colors.textMuted }]}>{item.countryName}</Text>
              </View>
              <Star on={isLeague(item.slug)} onToggle={() => toggleLeague(item.slug)} />
            </Pressable>
          ) : (
            <View style={[styles.row, { backgroundColor: colors.card }]}>
              <Crest uri={item.crest} name={item.name} size={26} />
              <View style={{ flex: 1 }}>
                <Text style={[t.bodyMed, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[t.caption, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.league.name}
                </Text>
              </View>
              <Star on={isTeam(item.id)} onToggle={() => toggleTeam(item.id)} />
            </View>
          )
        }
        ListEmptyComponent={
          <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xxxl }]}>
            {q.trim().length < 2 ? 'Type at least two letters' : `Nothing matches “${q}”`}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  search: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.md, height: 44, borderRadius: radius.md,
  },
  sectionHeader: { paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    marginHorizontal: space.md, marginBottom: space.sm,
    padding: space.md, borderRadius: radius.md,
  },
});
