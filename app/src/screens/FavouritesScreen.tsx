import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import { usePrefs } from '../store/prefs';
import { useMatches } from '../api/useMatches';
import { api } from '../api/client';
import { LeagueHeader } from '../components/LeagueHeader';
import { MatchRow } from '../components/MatchRow';
import { Crest } from './../components/Crest';
import { Star } from '../components/Star';
import { Button } from '../components/Button';
import { EmptyState, RowSkeleton } from '../components/StateViews';
import { dayKeyUTC } from '../util/format';
import type { TabScreenProps } from '../navigation/types';
import type { Match, Team } from '../api/types';

type Props = TabScreenProps<'Favourites'>;
type Tab = 'matches' | 'teams';

export function FavouritesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, isMatch, toggleMatch, toggleTeam } = usePrefs();
  const [tab, setTab] = useState<Tab>('matches');
  const [confirm, setConfirm] = useState<Team | null>(null);

  const today = useMemo(() => dayKeyUTC(new Date()), []);
  const { groups, loading, hasData } = useMatches({ mode: 'day', date: today, leagues: prefs.leagues });

  /** Favourites are anything explicitly starred, plus every match involving a
   *  followed team — starring Gor Mahia should not mean starring each fixture. */
  const starredMatches = useMemo(() => {
    const teams = new Set(prefs.teams);
    return groups
      .map(g => ({
        ...g,
        matches: g.matches.filter(
          m => prefs.matches.includes(m.id) || teams.has(m.home.id) || teams.has(m.away.id),
        ),
      }))
      .filter(g => g.matches.length > 0);
  }, [groups, prefs.matches, prefs.teams]);

  const teamIndex = useTeamIndex(prefs.teams, groups);

  const sections = useMemo(
    () => starredMatches.map(g => ({ key: g.league.slug, league: g.league, data: g.matches })),
    [starredMatches],
  );

  const openMatch = useCallback((m: Match) => {
    navigation.navigate('MatchDetail', { matchId: m.id, leagueSlug: m.league.slug });
  }, [navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={[t.h3, { color: colors.text }]}>Favourites</Text>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.divider }]}>
        {(['matches', 'teams'] as Tab[]).map(k => (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
          >
            <Text
              style={{
                color: tab === k ? colors.accent : colors.textMuted,
                fontFamily: tab === k ? font.semibold : font.medium,
                fontSize: 15,
              }}
            >
              {k === 'matches' ? 'Matches' : 'My Teams'}
            </Text>
            <View
              style={[styles.underline, { backgroundColor: tab === k ? colors.accent : 'transparent' }]}
            />
          </Pressable>
        ))}
      </View>

      {tab === 'matches' ? (
        loading && !hasData ? (
          <View style={{ paddingTop: space.lg }}><RowSkeleton count={3} /></View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={m => m.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
            renderSectionHeader={({ section }) => <LeagueHeader league={section.league} />}
            renderItem={({ item }) => (
              <MatchRow
                match={item}
                starred={isMatch(item.id)}
                onToggleStar={() => toggleMatch(item.id)}
                onPress={() => openMatch(item)}
                showOdds
              />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="star-outline"
                title="No favourites yet"
                subtitle="Star a match or follow a team and it will appear here."
              />
            }
          />
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: insets.bottom + 90 }}>
          {teamIndex.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No teams followed"
              subtitle="Follow a team from any match to get its fixtures and goal alerts."
            />
          ) : (
            <>
              <Text style={[t.label, { color: colors.textMuted, marginBottom: space.sm }]}>MY TEAMS</Text>
              {teamIndex.map(team => (
                <View
                  key={team.id}
                  style={[styles.teamRow, { backgroundColor: colors.card }]}
                >
                  <Crest uri={team.crest} name={team.name} size={24} />
                  <Text style={[t.bodyMed, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {team.name}
                  </Text>
                  <Star on onToggle={() => setConfirm(team)} />
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={confirm !== null} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.sheetScrim}>
          <View style={[styles.sheet, { backgroundColor: colors.chrome, paddingBottom: insets.bottom + space.xl }]}>
            <Ionicons name="trash-outline" size={30} color={colors.text} />
            <Text style={[t.h3, { color: colors.text, marginTop: space.md }]}>Remove Team</Text>
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.sm }]}>
              Stop following {confirm?.name} and turn off its notifications?
            </Text>
            <Button
              label="Confirm"
              onPress={() => { if (confirm) toggleTeam(confirm.id); setConfirm(null); }}
              style={{ alignSelf: 'stretch', marginTop: space.xl }}
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setConfirm(null)}
              style={{ alignSelf: 'stretch', marginTop: space.xs }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Resolve followed team ids to display data.
 *
 * Teams are stored as bare ids, so their names and crests come from whatever
 * fixtures are loaded. Anything not in today's slate is remembered locally so
 * a followed team never renders as a blank row out of season.
 */
function useTeamIndex(ids: string[], groups: ReturnType<typeof useMatches>['groups']): Team[] {
  const [cache, setCache] = useState<Record<string, Team>>({});

  useEffect(() => {
    const found: Record<string, Team> = {};
    for (const g of groups) {
      for (const m of g.matches) {
        if (ids.includes(m.home.id)) found[m.home.id] = m.home;
        if (ids.includes(m.away.id)) found[m.away.id] = m.away;
      }
    }
    if (Object.keys(found).length) setCache(prev => ({ ...prev, ...found }));
  }, [groups, ids]);

  return ids.map(
    id => cache[id] ?? { id, name: id.replace(/^espn:/, 'Team '), shortName: '???', crest: null },
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'center' },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { paddingHorizontal: space.lg, paddingTop: space.sm, alignItems: 'center' },
  underline: { height: 3, borderRadius: 2, alignSelf: 'stretch', marginTop: space.sm, width: 60 },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    padding: space.md, borderRadius: radius.md, marginBottom: space.sm,
  },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xxl,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
});
