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
    hasData: false, lastLoadedAt: 0,
  });

  const reqId = useRef(0);

  const load = useCallback(async (opts: { refresh?: boolean } = {}) => {
    const id = ++reqId.current;
    setState(s => ({
      ...s,
      loading: !s.hasData,
      refreshing: Boolean(opts.refresh),
      error: opts.refresh ? null : s.error,
    }));

    try {
      const res = mode === 'live'
        ? await api.live(leagues, sport)
        : await api.matches(date, leagues, sport);
      if (id !== reqId.current) return;                 // a newer request won
      setState({
        groups: res.groups, loading: false, refreshing: false,
        error: null, hasData: true, lastLoadedAt: Date.now(),
      });
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
    onResync: () => void load({ refresh: true }),
  });

  useEffect(() => subscribe(deltas => {
    setState(s => {
      let groups = s.groups;
      for (const d of deltas) groups = applyDelta(groups, d);
      // In live mode a match that ends should drop off the list.
      if (mode === 'live') {
        groups = groups
          .map(g => ({ ...g, matches: g.matches.filter(m => m.state === 'live' || m.state === 'halftime') }))
          .filter(g => g.matches.length > 0);
      }
      return groups === s.groups ? s : { ...s, groups };
    });
  }), [subscribe, mode]);

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
