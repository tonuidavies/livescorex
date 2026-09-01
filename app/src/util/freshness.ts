import type { LeagueGroup } from '../api/types';
import type { ConnState } from '../api/useLive';

export type Freshness =
  | { kind: 'ok' }
  | { kind: 'offline' }
  | { kind: 'disconnected'; since: number }
  | { kind: 'stale'; since: number };

/**
 * Whether to warn the user, and about what.
 *
 * The first version warned whenever *any* league-day was marked stale, which
 * fires constantly and means nothing: a league whose matches all finished
 * hours ago is deliberately not re-polled, so its slate is old by design. A
 * warning that is always on is a warning nobody reads.
 *
 * So: only complain when something is actually wrong — no network, a dropped
 * socket, or a live match whose score has genuinely stopped arriving.
 */
export function freshness(
  groups: LeagueGroup[],
  conn: ConnState,
  online: boolean,
  lastHeardAt: number,
): Freshness {
  if (!online) return { kind: 'offline' };
  if (conn === 'offline') return { kind: 'disconnected', since: lastHeardAt || Date.now() };

  // Staleness only matters where something is in progress.
  const anyLive = groups.some(g =>
    g.matches.some(m => m.state === 'live' || m.state === 'halftime'),
  );
  if (!anyLive) return { kind: 'ok' };

  // `lastHeardAt`, not the server's `fetchedAt`: the latter is captured once
  // at response time and then ages on the client even while delta frames keep
  // arriving, which warned about a screen that was perfectly current.
  const since = lastHeardAt || Date.now();
  const STALE_AFTER_MS = 150_000;
  if (Date.now() - since > STALE_AFTER_MS) return { kind: 'stale', since };

  return { kind: 'ok' };
}
