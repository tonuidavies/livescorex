import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ErrorState, Loading } from '../components/StateViews';
import type { League, Sport } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Leagues'>;

const ROW_H = 56;
const HEADER_H = 34;
/** Gutter reserved for the alphabet rail so it never sits on the stars. */
const RAIL_W = 22;

/**
 * League browser across every sport.
 *
 * Rewritten around density. The first version gave each league a 90px card
 * repeating its country and the words "Fast updates" — under a header already
 * naming that country — so eight rows filled the screen and the repetition
 * carried no information. This fits roughly twice as many and adds the thing a
 * 259-item list actually needs: an alphabet rail to jump with.
 */
export function LeaguesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, isLeague, toggleLeague } = usePrefs();

  const listRef = useRef<SectionList<League, { title: string; data: League[] }>>(null);
  const [all, setAll] = useState<League[] | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sport, setSport] = useState<string>(prefs.sport);

  const load = useCallback(() => {
    setError(null);
    setAll(null);
    api.leagues(sport)
      .then(r => { setAll(r.leagues); setSports(r.sports); })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load leagues'));
  }, [sport]);
  useEffect(load, [load]);

  // Football is the only sport with a country dimension worth grouping by.
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

    const byGroup = new Map<string, League[]>();
    for (const l of rest) {
      const key = grouped ? l.countryName : l.sportName;
      const arr = byGroup.get(key) ?? [];
      arr.push(l);
      byGroup.set(key, arr);
    }

    const out: Array<{ title: string; data: League[] }> = [];
    if (followed.length) out.push({ title: `Following · ${followed.length}`, data: followed });
    for (const [name, leagues] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push({ title: name, data: leagues.sort((x, y) => x.name.localeCompare(y.name)) });
    }
    return out;
  }, [all, q, grouped, prefs.leagues]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Letters that actually have a section, so the rail never lies. */
  const letters = useMemo(() => {
    const seen = new Map<string, number>();
    sections.forEach((s, i) => {
      const ch = s.title.startsWith('Following') ? '★' : (s.title[0] ?? '#').toUpperCase();
      if (!seen.has(ch)) seen.set(ch, i);
    });
    return [...seen.entries()];
  }, [sections]);

  const jumpTo = (sectionIndex: number) => {
    listRef.current?.scrollToLocation({
      sectionIndex, itemIndex: 0, viewPosition: 0, animated: false,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[t.h3, { color: colors.text, flex: 1, textAlign: 'center' }]}>Leagues</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
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

      {sports.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipStrip}
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
                  style={{
                    color: on ? colors.onAccent : colors.textMuted,
                    fontFamily: on ? font.semibold : font.medium,
                    fontSize: 13,
                    // A fixed line height: the previous chips clipped their
                    // own text on Android, which read as a rendering fault.
                    lineHeight: 17,
                  }}
                  numberOfLines={1}
                >
                  {sp.name}
                </Text>
                <Text
                  style={{
                    color: on ? 'rgba(255,255,255,0.75)' : colors.textDim,
                    fontFamily: font.medium, fontSize: 11, lineHeight: 17,
                  }}
                >
                  {sp.leagues}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !all ? (
        <Loading />
      ) : (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <SectionList
            ref={listRef}
            sections={sections}
            keyExtractor={l => l.slug}
            stickySectionHeadersEnabled
            contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
            keyboardShouldPersistTaps="handled"
            getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
            onScrollToIndexFailed={() => { /* section not measured yet; harmless */ }}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: colors.bg }]}>
                <Text style={[t.label, { color: colors.textMuted }]} numberOfLines={1}>
                  {section.title.toUpperCase()}
                </Text>
                <View style={[styles.rule, { backgroundColor: colors.divider }]} />
              </View>
            )}
            renderItem={({ item, section }) => {
              const following = isLeague(item.slug);
              // The country is already the section heading; repeating it in
              // every row was pure noise.
              const showCountry =
                grouped && (section.title.startsWith('Following') || Boolean(q));
              return (
                <Pressable
                  onPress={() => navigation.navigate('Table', { leagueSlug: item.slug })}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? colors.card : 'transparent' },
                  ]}
                >
                  <LeagueCrest league={item} size={26} />
                  <View style={{ flex: 1 }}>
                    <Text style={[t.bodyMed, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {showCountry ? (
                      <Text style={[t.caption, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.countryName}
                      </Text>
                    ) : null}
                  </View>

                  {/* A dot instead of the words "Fast updates" on every row. */}
                  {item.tier === 1 ? (
                    <View
                      style={[styles.tierDot, { backgroundColor: colors.markerPromotion }]}
                      accessibilityLabel="Fast updates"
                    />
                  ) : null}

                  <Pressable
                    onPress={() => toggleLeague(item.slug)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={following ? `Unfollow ${item.name}` : `Follow ${item.name}`}
                  >
                    <Ionicons
                      name={following ? 'star' : 'star-outline'}
                      size={19}
                      color={following ? colors.markerPromotion : colors.textDim}
                    />
                  </Pressable>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xxxl }]}>
                Nothing matches “{q}”.
              </Text>
            }
          />

          {/* Alphabet rail — the thing a 259-item list actually needs, and the
              reason the entry point is labelled A-Z in the first place. */}
          {letters.length > 4 && !q ? (
            <View style={styles.rail} pointerEvents="box-none">
              {letters.map(([ch, idx]) => (
                <Pressable
                  key={ch}
                  onPress={() => jumpTo(idx)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Jump to ${ch}`}
                >
                  <Text style={[styles.railText, { color: colors.textMuted }]}>{ch}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    marginHorizontal: space.md, marginBottom: space.sm,
    paddingHorizontal: space.md, height: 42,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth,
  },
  chipStrip: { flexGrow: 0, marginBottom: space.xs },
  chipRow: { paddingHorizontal: space.md, gap: space.sm, paddingBottom: space.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: space.md, paddingVertical: 7,
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    height: HEADER_H, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingLeft: space.md, paddingRight: space.md + RAIL_W,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  row: {
    height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingLeft: space.md, paddingRight: space.md + RAIL_W,
  },
  tierDot: { width: 6, height: 6, borderRadius: 3 },
  rail: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: RAIL_W,
    justifyContent: 'center', alignItems: 'center', paddingVertical: space.sm,
  },
  railText: { fontFamily: font.semibold, fontSize: 10, lineHeight: 15, paddingHorizontal: 4 },
});
