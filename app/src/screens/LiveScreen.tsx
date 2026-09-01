import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme';
import { usePrefs } from '../store/prefs';
import { useMatches } from '../api/useMatches';
import { LeagueHeader } from '../components/LeagueHeader';
import { MatchRow } from '../components/MatchRow';
import { TopBar } from '../components/TopBar';
import { SideBar } from '../components/SideBar';
import { EmptyState, ErrorState, RowSkeleton, StaleBanner } from '../components/StateViews';
import { useNowTicker } from '../util/useMatchClock';
import { useOnline } from '../util/useOnline';
import { freshness } from '../util/freshness';
import type { TabScreenProps } from '../navigation/types';
import type { Match } from '../api/types';
import { SelectionBar } from '../components/SelectionBar';

type Props = TabScreenProps<'Live'>;

/**
 * In-play matches only.
 *
 * There is deliberately no date strip here — "live" is always now, so the
 * wireframe's date row would be inert. The space goes to the league filter
 * chip instead, which is the control people actually reach for mid-Saturday.
 */
export function LiveScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, isMatch, toggleMatch } = usePrefs();
  const [menu, setMenu] = useState(false);
  const [selecting, setSelecting] = useState(false);

  /**
   * Every competition by default.
   *
   * Live is a discovery surface: the point is seeing that something is on,
   * including in leagues you have not thought to follow. Filtering it to
   * followed leagues made the tab look empty on a busy evening. The LIVE pill
   * narrows it to your leagues when you want that.
   */
  const [onlyMine, setOnlyMine] = useState(false);

  const leagues = onlyMine ? prefs.leagues : [];
  const online = useOnline();
  const { groups, loading, refreshing, error, hasData, conn, reload, lastLoadedAt } =
    useMatches({ mode: 'live', date: '', leagues });

  // Live clocks are interpolated between server updates, so the list needs a
  // heartbeat of its own to advance them.
  const now = useNowTicker(groups.length > 0);

  const sections = useMemo(
    () => groups.map(g => ({ key: g.league.slug, league: g.league, data: g.matches })),
    [groups],
  );

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

      {selecting ? (
        <SelectionBar count={prefs.matches.length} onDone={() => setSelecting(false)} />
      ) : null}

      <StaleBanner state={freshness(groups, conn, online, lastLoadedAt)} />

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
              showOdds={false}
              now={now}
              selecting={selecting}
              onLongPress={() => setSelecting(true)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="pulse-outline"
              title="Nothing live right now"
              subtitle={
                onlyMine
                  ? 'No matches in progress in the leagues you follow. Tap LIVE to see every competition.'
                  : 'No matches in progress in any of the 259 competitions. Check Matches for what’s coming up.'
              }
            />
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
