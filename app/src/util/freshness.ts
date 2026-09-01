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
  lastLoadedAt: number,
): Freshness {
  if (!online) return { kind: 'offline' };
  if (conn === 'offline') return { kind: 'disconnected', since: lastLoadedAt || Date.now() };

  // Staleness only matters where something is in progress.
  const liveGroups = groups.filter(g =>
    g.matches.some(m => m.state === 'live' || m.state === 'halftime'),
  );
  if (liveGroups.length === 0) return { kind: 'ok' };

  const oldest = Math.min(...liveGroups.map(g => g.fetchedAt));
  const STALE_AFTER_MS = 120_000;
  if (Date.now() - oldest > STALE_AFTER_MS) return { kind: 'stale', since: oldest };

  return { kind: 'ok' };
}
