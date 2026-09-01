import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import { api } from '../api/client';
import { usePrefs } from '../store/prefs';
import { LeagueCrest } from '../components/Crest';
import { Star } from '../components/Star';
import { ErrorState, Loading } from '../components/StateViews';
import type { League, Sport } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Leagues'>;

/**
 * League browser over the full 259-competition catalogue.
 *
 * Followed leagues are pinned to the top so the list stays usable at that
 * size, and search matches competition, country, and slug.
 */
export function LeaguesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, isLeague, toggleLeague } = usePrefs();

  const [all, setAll] = useState<League[] | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  // Browsing scope, seeded from the app's current sport.
  const [sport, setSport] = useState<string>(prefs.sport);

  const load = useCallback(() => {
    setError(null);
    setAll(null);
    api.leagues(sport)
      .then(r => { setAll(r.leagues); setSports(r.sports); })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load leagues'));
  }, [sport]);
  useEffect(load, [load]);

  // Non-football leagues have no country dimension, so they group under the
  // sport itself rather than pretending to a geography they do not have.
  const grouped = sport === 'soccer';

  const sections = useMemo(() => {
    if (!all) return [];
    const needle = q.trim().toLowerCase();
    const match = (l: League) =>
      !needle ||
      l.name.toLowerCase().includes(needle) ||
      l.countryName.toLowerCase().includes(needle) ||
      l.slug.includes(needle);

    const followed = all.filter(l => isLeague(l.slug) && match(l));
    const rest = all.filter(l => !isLeague(l.slug) && match(l));

    const byCountry = new Map<string, League[]>();
    for (const l of rest) {
      const key = grouped ? l.countryName : l.sportName;
      const arr = byCountry.get(key) ?? [];
      arr.push(l);
      byCountry.set(key, arr);
    }

    const out: Array<{ title: string; data: League[] }> = [];
    if (followed.length) out.push({ title: `FOLLOWING (${followed.length})`, data: followed });
    for (const [country, leagues] of [...byCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push({ title: country.toUpperCase(), data: leagues.sort((x, y) => x.name.localeCompare(y.name)) });
    }
    return out;
  }, [all, q, grouped, prefs.leagues]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[t.h3, { color: colors.text, flex: 1, textAlign: 'center' }]}>Leagues</Text>
        <View style={{ width: 26 }} />
      </View>

      {sports.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {sports.map(sp => {
            const on = sp.sport === sport;
            return (
              <Pressable
                key={sp.sport}
                onPress={() => { setSport(sp.sport); setQ(''); }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? colors.accent : colors.card,
                    borderColor: on ? colors.accent : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text
                  style={[
                    t.caption,
                    { color: on ? colors.onAccent : colors.textMuted },
                  ]}
                >
                  {sp.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={[styles.search, { backgroundColor: colors.card }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search competitions or countries"
          placeholderTextColor={colors.textDim}
          style={[t.body, { color: colors.text, flex: 1, paddingVertical: 0 }]}
          autoCorrect={false}
          returnKeyType="search"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={17} color={colors.textDim} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !all ? (
        <Loading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={l => l.slug}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) => (
            <Text style={[t.label, styles.sectionHeader, { color: colors.textMuted, backgroundColor: colors.bg }]}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, { backgroundColor: colors.card }]}
              onPress={() => navigation.navigate('Table', { leagueSlug: item.slug })}
            >
              <LeagueCrest league={item} size={26} />
              <View style={{ flex: 1 }}>
                <Text style={[t.bodyMed, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[t.caption, { color: colors.textMuted }]} numberOfLines={1}>
                  {grouped ? item.countryName : item.sportName}
                  {item.tier === 1 ? '  ·  Fast updates' : ''}
                </Text>
              </View>
              <Star on={isLeague(item.slug)} onToggle={() => toggleLeague(item.slug)} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xxxl }]}>
              Nothing matches “{q}”.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    marginHorizontal: space.md, marginBottom: space.sm,
    paddingHorizontal: space.md, height: 44, borderRadius: radius.md,
  },
  sectionHeader: { paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  chips: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.sm },
  chip: {
    paddingHorizontal: space.md, paddingVertical: 7,
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    marginHorizontal: space.md, marginBottom: space.sm,
    padding: space.md, borderRadius: radius.md,
  },
});
