import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';
import { applyDelta, useLiveSocket } from './useLive';
import type { LeagueGroup } from './types';

interface State {
  groups: LeagueGroup[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** True once we have shown something — used to keep content on screen while
   *  a refetch is in flight instead of flashing a spinner over it. */
  hasData: boolean;
  lastLoadedAt: number;
  /**
   * Match id -> when a goal last landed for it.
   *
   * A score changing is the single most important thing this app ever has to
   * say, and a digit quietly incrementing in a list of forty rows is easy to
   * miss entirely. The list uses this to light the row up.
   */
  goals: Record<string, number>;
}

/**
 * Fixture list for one day (or the live slate), kept current by deltas.
 *
 * A failed refetch never clears `groups`. Losing the network shows the last
 * good slate behind a staleness banner, which is the whole point: blocked or
 * offline must degrade to stale, never to blank.
 */
export function useMatches({
  mode, date, leagues, sport = 'soccer',
}: { mode: 'day' | 'live'; date: string; leagues: string[]; sport?: string }) {
  const [state, setState] = useState<State>({
    groups: [], loading: true, refreshing: false, error: null,
    hasData: false, lastLoadedAt: 0, goals: {},
  });

  const reqId = useRef(0);
  /** What the current `state.groups` actually describe. */
  const shownKey = useRef<string>('');

  const load = useCallback(async (opts: { refresh?: boolean } = {}) => {
    const id = ++reqId.current;
    const key = `${mode}|${date}|${sport}`;
    // Switching day or sport must not leave the previous list on screen under
    // a new heading — that is the wrong data, not stale data, and it made a
    // date tap look like it had done nothing while the fetch ran.
    const changedScope = shownKey.current !== '' && shownKey.current !== key;

    setState(s => ({
      ...s,
      groups: changedScope ? [] : s.groups,
      hasData: changedScope ? false : s.hasData,
      loading: changedScope || !s.hasData,
      refreshing: Boolean(opts.refresh),
      error: opts.refresh || changedScope ? null : s.error,
    }));

    try {
      const res = mode === 'live'
        ? await api.live(leagues, sport)
        : await api.matches(date, leagues, sport);
      if (id !== reqId.current) return;                 // a newer request won
      shownKey.current = key;
      setState(s => ({
        ...s,
        groups: res.groups, loading: false, refreshing: false,
        error: null, hasData: true, lastLoadedAt: Date.now(),
      }));
    } catch (e) {
      if (id !== reqId.current) return;
      setState(s => ({
        ...s,
        loading: false,
        refreshing: false,
        // Keep whatever we already have. Stale beats blank.
        error: e instanceof Error ? e.message : 'Network error',
      }));
    }
  }, [mode, date, sport, leagues.join(',')]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const { state: conn, subscribe, lastFrameAt } = useLiveSocket({
    leagues,
    // Live mode always means today; day mode means whichever day is shown.
    day: mode === 'live' ? undefined : date,
    onResync: () => void load({ refresh: true }),
  });

  useEffect(() => subscribe(deltas => {
    setState(s => {
      let groups = s.groups;
      let goals = s.goals;
      for (const d of deltas) {
        // A brand-new match only belongs here if it is in the sport on show;
        // the socket carries every sport the server polls.
        if (d.t === 'match' && d.match.league.sport !== sport) continue;
        if (d.t === 'score') {
          const before = groups.flatMap(g => g.matches).find(m => m.id === d.id);
          // Only a change counts. A resync that re-states the same score is
          // not a goal and must not set the whole screen flashing.
          const changed =
            before && (before.score.home !== d.home || before.score.away !== d.away);
          if (changed) goals = { ...goals, [d.id]: Date.now() };
        }
        groups = applyDelta(groups, d);
      }
      // In live mode a match that ends should drop off the list.
      if (mode === 'live') {
        groups = groups
          .map(g => ({ ...g, matches: g.matches.filter(m => m.state === 'live' || m.state === 'halftime') }))
          .filter(g => g.matches.length > 0);
      }
      if (groups === s.groups && goals === s.goals) return s;
      return { ...s, groups, goals };
    });
  }), [subscribe, mode, sport]);

  return {
    ...state,
    conn,
    /**
     * When we last heard anything at all — a full load or a delta frame.
     *
     * Distinct from the server's own `fetchedAt`, which is captured once at
     * HTTP response time and then ages on the client even while deltas keep
     * arriving. Judging staleness by that produced a "scores may be delayed"
     * warning over a perfectly live screen.
     */
    lastHeardAt: Math.max(state.lastLoadedAt, lastFrameAt),
    reload: () => load({ refresh: true }),
  };
}
