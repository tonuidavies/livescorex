import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getWsUrl } from './client';
import type { Delta, DeltaFrame, LeagueGroup, Match } from './types';

export type ConnState = 'connecting' | 'open' | 'offline';

interface Options {
  /** League slugs to subscribe to. Empty means everything. */
  leagues: string[];
  /** Called when the stream reports a gap in `seq` — refetch rather than drift. */
  onResync?: () => void;
  enabled?: boolean;
}

/**
 * Delta socket with exponential backoff and app-state awareness.
 *
 * The socket closes when the app backgrounds: on a metered connection a live
 * stream nobody is looking at is pure cost, and backgrounded score updates are
 * the push notification's job, not the socket's.
 */
export function useLiveSocket({ leagues, onResync, enabled = true }: Options) {
  const [state, setState] = useState<ConnState>('connecting');
  const [lastFrameAt, setLastFrameAt] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const seqRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef<Set<(d: Delta[]) => void>>(new Set());
  const closedByUs = useRef(false);

  const leagueKey = useMemo(() => [...leagues].sort().join(','), [leagues]);
  const onResyncRef = useRef(onResync);
  useEffect(() => { onResyncRef.current = onResync; }, [onResync]);

  const subscribe = useCallback((fn: (d: Delta[]) => void) => {
    handlersRef.current.add(fn);
    return () => { handlersRef.current.delete(fn); };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const clearTimer = () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    const connect = () => {
      if (disposed) return;
      closedByUs.current = false;
      setState(attemptRef.current === 0 ? 'connecting' : 'offline');

      let ws: WebSocket;
      try {
        ws = new WebSocket(getWsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        attemptRef.current = 0;
        setState('open');
        const subs = leagueKey ? leagueKey.split(',') : [];
        ws.send(JSON.stringify({ type: 'subscribe', leagues: subs }));
      };

      ws.onmessage = ev => {
        if (disposed) return;
        try {
          const msg = JSON.parse(String(ev.data)) as DeltaFrame & { type?: string };
          if (msg.type === 'hello') { seqRef.current = msg.seq ?? null; return; }
          if (msg.type) return;   // subscribed / pong

          // A gap means we missed frames while the radio was asleep. Refetch
          // instead of applying deltas on top of a state we can't trust.
          if (seqRef.current !== null && msg.seq > seqRef.current + 1) {
            onResyncRef.current?.();
          }
          seqRef.current = msg.seq;
          setLastFrameAt(Date.now());
          for (const h of handlersRef.current) h(msg.deltas);
        } catch { /* malformed frame — ignore, the next one will be fine */ }
      };

      ws.onerror = () => { /* onclose always follows; handle it there */ };
      ws.onclose = () => {
        if (disposed || closedByUs.current) return;
        setState('offline');
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      clearTimer();
      const n = attemptRef.current++;
      const base = Math.min(30_000, 1000 * 2 ** Math.min(n, 5));
      timerRef.current = setTimeout(connect, base + Math.random() * base * 0.3);
    };

    const close = () => {
      closedByUs.current = true;
      clearTimer();
      try { wsRef.current?.close(); } catch { /* already gone */ }
      wsRef.current = null;
    };

    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') {
        if (!wsRef.current || wsRef.current.readyState > 1) {
          attemptRef.current = 0;
          onResyncRef.current?.();     // we were away; assume we missed things
          connect();
        }
      } else {
        close();
        setState('offline');
      }
    });

    connect();
    return () => {
      disposed = true;
      sub.remove();
      close();
    };
  }, [leagueKey, enabled]);

  return { state, lastFrameAt, subscribe };
}

/** Apply one delta to a list of league groups, in place of a full refetch. */
export function applyDelta(groups: LeagueGroup[], d: Delta): LeagueGroup[] {
  let changed = false;

  const next = groups.map(g => {
    let touched = false;
    const matches = g.matches.reduce<Match[]>((acc, m) => {
      if (m.id !== d.id) { acc.push(m); return acc; }
      touched = true;
      switch (d.t) {
        case 'score':
          acc.push({ ...m, score: { home: d.home, away: d.away }, minute: d.minute, updatedAt: Date.now() });
          break;
        case 'state':
          acc.push({ ...m, state: d.state, statusLabel: d.statusLabel, minute: d.minute, updatedAt: Date.now() });
          break;
        case 'minute':
          acc.push({ ...m, minute: d.minute, updatedAt: Date.now() });
          break;
        case 'match':
          acc.push(d.match);
          break;
        case 'gone':
          break;                       // drop it
        default:
          acc.push(m);
      }
      return acc;
    }, []);

    if (touched) { changed = true; return { ...g, matches }; }
    return g;
  });

  if (d.t === 'match' && !changed) {
    // A match we have never seen — belongs to a league group we may not have.
    const g = next.find(x => x.league.slug === d.match.league.slug);
    if (g) {
      return next.map(x => x === g
        ? { ...x, matches: [...x.matches, d.match].sort((a, b) => a.kickoff - b.kickoff) }
        : x);
    }
    return [...next, {
      league: d.match.league, fetchedAt: Date.now(), stale: false, matches: [d.match],
    }];
  }

  return changed ? next.filter(g => g.matches.length > 0) : groups;
}
