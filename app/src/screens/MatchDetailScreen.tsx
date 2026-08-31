import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t, radius } from '../theme';
import { api } from '../api/client';
import { useLiveSocket } from '../api/useLive';
import { usePrefs } from '../store/prefs';
import { MatchHeader } from '../components/MatchHeader';
import { Tabs, type TabDef } from '../components/Tabs';
import { Timeline } from '../components/Timeline';
import { StatsTable } from '../components/StatsTable';
import { StandingsTable } from '../components/StandingsTable';
import { Pitch } from '../components/Pitch';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import { MatchRow } from '../components/MatchRow';
import type { MatchDetail } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchDetail'>;

/**
 * Match detail.
 *
 * Tabs are built from `detail.available`, which the server derives from what
 * the source actually returned. A Kenyan Premier League fixture with no key
 * events simply has no Summary tab, instead of a tab that opens onto nothing.
 */
export function MatchDetailScreen({ route, navigation }: Props) {
  const { matchId } = route.params;
  // A deep link from a notification carries only the match id. The server can
  // resolve the league from a match it already knows, so an absent slug is a
  // normal case rather than an error.
  const leagueSlug = route.params.leagueSlug ?? '';
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isMatch, toggleMatch, isTeam, toggleTeam } = usePrefs();

  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>('summary');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const d = await api.detail(matchId, leagueSlug);
      setDetail(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this match');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [matchId, leagueSlug]);

  useEffect(() => { void load(); }, [load]);

  // Keep the header score current from the socket without refetching the
  // whole detail payload on every minute tick.
  const { subscribe } = useLiveSocket({ leagues: [leagueSlug] });
  useEffect(() => subscribe(deltas => {
    for (const d of deltas) {
      if (d.id !== matchId) continue;
      setDetail(prev => {
        if (!prev) return prev;
        if (d.t === 'score') {
          return { ...prev, match: { ...prev.match, score: { home: d.home, away: d.away }, minute: d.minute } };
        }
        if (d.t === 'state') {
          return { ...prev, match: { ...prev.match, state: d.state, statusLabel: d.statusLabel, minute: d.minute } };
        }
        if (d.t === 'minute') {
          return { ...prev, match: { ...prev.match, minute: d.minute } };
        }
        return prev;
      });
      // A goal changes the timeline and the stats, so pull the full payload.
      if (d.t === 'score') void load(true);
    }
  }), [subscribe, matchId, load]);

  const tabs: TabDef[] = useMemo(() => {
    const a = detail?.available;
    const prematch = detail?.match.state === 'scheduled';
    return [
      { key: 'summary', label: prematch ? 'Overview' : 'Summary', enabled: prematch ? Boolean(detail?.lineups) : a?.summary !== false },
      { key: 'statistics', label: 'Statistics', enabled: a?.statistics === true },
      { key: 'lineup', label: 'Lineup', enabled: a?.lineup === true },
      { key: 'h2h', label: 'Matches', enabled: (detail?.headToHead.length ?? 0) > 0 },
      { key: 'standings', label: 'Standings', enabled: a?.standings === true },
    ];
  }, [detail]);

  // Keep the selection valid when the available set changes under us.
  useEffect(() => {
    const enabled = tabs.filter(x => x.enabled !== false).map(x => x.key);
    if (enabled.length && !enabled.includes(tab)) setTab(enabled[0]!);
  }, [tabs, tab]);

  if (loading && !detail) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Loading /></View>;
  if (!detail) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ErrorState message={error ?? 'Match unavailable'} onRetry={() => void load(true)} />
      </View>
    );
  }

  const m = detail.match;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MatchHeader
        match={m}
        onBack={() => navigation.goBack()}
        starred={isMatch(m.id)}
        onToggleStar={() => toggleMatch(m.id)}
        homeStarred={isTeam(m.home.id)}
        awayStarred={isTeam(m.away.id)}
        onToggleHome={() => toggleTeam(m.home.id)}
        onToggleAway={() => toggleTeam(m.away.id)}
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} />
        }
      >
        {tab === 'summary' && (
          detail.events.length > 0
            ? <Timeline events={detail.events} />
            : detail.lineups
              ? <Pitch home={detail.lineups.home} away={detail.lineups.away} homeColor={colors.accent} awayColor="#3E6DD1" />
              : <EmptyState icon="time-outline" title="No timeline yet" subtitle="Events appear here once the match kicks off." />
        )}

        {tab === 'statistics' && (
          <StatsTable stats={detail.stats} home={m.home} away={m.away} />
        )}

        {tab === 'lineup' && detail.lineups && (
          <View style={{ paddingTop: space.md }}>
            <Pitch
              home={detail.lineups.home}
              away={detail.lineups.away}
              homeColor={colors.accent}
              awayColor="#3E6DD1"
            />
            {!detail.lineups.home.hasPitchPositions ? (
              <Text style={[t.caption, styles.note, { color: colors.textDim }]}>
                This competition doesn’t publish formation positions, so the XI is listed instead.
              </Text>
            ) : null}
          </View>
        )}

        {tab === 'h2h' && (
          <View style={{ paddingTop: space.lg }}>
            <Text style={[t.label, { color: colors.textMuted, paddingHorizontal: space.md, paddingBottom: space.sm }]}>
              PREVIOUS MEETINGS
            </Text>
            {detail.headToHead.map(h => (
              <MatchRow
                key={h.id}
                match={h}
                starred={isMatch(h.id)}
                onToggleStar={() => toggleMatch(h.id)}
                onPress={() => navigation.push('MatchDetail', { matchId: h.id, leagueSlug: h.league.slug })}
                showOdds={false}
              />
            ))}
          </View>
        )}

        {tab === 'standings' && detail.standings && (
          <StandingsTable
            rows={detail.standings.rows}
            highlight={[m.home.id, m.away.id]}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: space.md, paddingTop: space.md, textAlign: 'center' },
});
