import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t } from '../theme';
import { usePrefs } from '../store/prefs';
import { useMatches } from '../api/useMatches';
import { dayKeyUTC } from '../util/format';
import { DateStrip } from '../components/DateStrip';
import { LeagueHeader } from '../components/LeagueHeader';
import { MatchRow } from '../components/MatchRow';
import { TopBar } from '../components/TopBar';
import { SideBar } from '../components/SideBar';
import { EmptyState, ErrorState, RowSkeleton, StaleBanner } from '../components/StateViews';
import { SelectionBar } from '../components/SelectionBar';
import { useNowTicker } from '../util/useMatchClock';
import { useOnline } from '../util/useOnline';
import { freshness } from '../util/freshness';
import type { TabScreenProps } from '../navigation/types';
import type { Match } from '../api/types';

type Props = TabScreenProps<'Matches'>;

/**
 * Fixtures for a chosen day, grouped by country and competition.
 *
 * The league filter is not a nicety: the catalogue is 259 competitions, so an
 * unfiltered Saturday is thousands of rows. Users see the leagues they picked
 * during onboarding and reach the rest through Browse leagues.
 */
export function MatchesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, isMatch, toggleMatch } = usePrefs();

  const [date, setDate] = useState(() => dayKeyUTC(new Date()));
  const [menu, setMenu] = useState(false);
  const [selecting, setSelecting] = useState(false);
  /**
   * Every competition by default.
   *
   * The followed-leagues filter made the app feel empty for anyone who had not
   * curated it, and hid exactly the obscure fixtures that make a scores app
   * worth opening. The filter is still one tap away for people who want it.
   */
  const [onlyMine, setOnlyMine] = useState(false);
  const online = useOnline();

  const leagues = onlyMine ? prefs.leagues : [];
  const { groups, loading, refreshing, error, hasData, conn, reload, lastLoadedAt } =
    useMatches({ mode: 'day', date, leagues });

  const anyLive = groups.some(g => g.matches.some(m => m.state === 'live'));
  const now = useNowTicker(anyLive);

  const sections = useMemo(
    () => groups.map(g => ({ key: g.league.slug, league: g.league, stale: g.stale, fetchedAt: g.fetchedAt, data: g.matches })),
    [groups],
  );

  const fresh = freshness(groups, conn, online, lastLoadedAt);

  const openMatch = useCallback((m: Match) => {
    navigation.navigate('MatchDetail', { matchId: m.id, leagueSlug: m.league.slug });
  }, [navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        onMenu={() => setMenu(true)}
        onSearch={() => navigation.navigate('Search')}
        onSort={() => navigation.navigate('Leagues')}
        onSettings={() => navigation.navigate('Settings')}
        onProfile={() => navigation.navigate('Profile')}
        liveActive={onlyMine}
        onToggleLive={() => setOnlyMine(v => !v)}
        liveLabel={onlyMine ? 'MINE' : 'ALL'}
        connState={conn}
      />

      <DateStrip selected={date} onSelect={setDate} />

      {selecting ? (
        <SelectionBar count={prefs.matches.length} onDone={() => setSelecting(false)} />
      ) : null}

      <StaleBanner state={fresh} />

      {loading && !hasData ? (
        <View style={{ paddingTop: space.lg }}><RowSkeleton /></View>
      ) : error && !hasData ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={m => m.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.accent} />
          }
          renderSectionHeader={({ section }) => (
            <LeagueHeader
              league={section.league}
              onPress={() => navigation.navigate('Table', { leagueSlug: section.league.slug })}
            />
          )}
          renderItem={({ item }) => (
            <MatchRow
              match={item}
              starred={isMatch(item.id)}
              onToggleStar={() => toggleMatch(item.id)}
              onPress={() => openMatch(item)}
              showOdds
              now={now}
              selecting={selecting}
              onLongPress={() => setSelecting(true)}
            />
          )}
          ListEmptyComponent={
            onlyMine && prefs.leagues.length === 0 ? (
              <EmptyState
                icon="funnel-outline"
                title="No leagues followed yet"
                subtitle="Follow a few competitions, or tap ALL to see everything."
                actionLabel="Browse leagues"
                onAction={() => navigation.navigate('Leagues')}
              />
            ) : (
              <EmptyState
                title="No matches on this day"
                subtitle={
                  onlyMine
                    ? `Nothing scheduled in your ${prefs.leagues.length} leagues. Tap ALL to see every competition.`
                    : 'Nothing scheduled anywhere on this date.'
                }
              />
            )
          }
        />
      )}

      <SideBar
        visible={menu}
        onClose={() => setMenu(false)}
        onNavigate={d => {
          if (d === 'settings') navigation.navigate('Settings');
          if (d === 'leagues') navigation.navigate('Leagues');
          if (d === 'profile') navigation.navigate('Profile');
        }}
        onSignOut={() => navigation.navigate('Auth')}
      />
    </View>
  );
}
