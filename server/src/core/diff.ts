import type { Delta, Match } from './schema.js';

/**
 * Compute the minimal set of deltas between two versions of a match.
 * A goal is ~200 bytes on the wire; refetching the scoreboard is ~200KB.
 * On a metered Kenyan data bundle that difference is the whole product.
 */
export function diffMatch(prev: Match | undefined, next: Match): Delta[] {
  if (!prev) return [{ t: 'match', id: next.id, match: next }];

  const out: Delta[] = [];

  const scoreChanged =
    prev.score.home !== next.score.home || prev.score.away !== next.score.away;
  if (scoreChanged && next.score.home !== null && next.score.away !== null) {
    out.push({
      t: 'score',
      id: next.id,
      home: next.score.home,
      away: next.score.away,
      minute: next.minute,
    });
  }

  if (prev.state !== next.state || prev.statusLabel !== next.statusLabel) {
    out.push({
      t: 'state',
      id: next.id,
      state: next.state,
      statusLabel: next.statusLabel,
      minute: next.minute,
    });
  } else if (prev.minute !== next.minute && next.minute !== null) {
    // Minute-only ticks are the most frequent update by far, and the cheapest.
    out.push({ t: 'minute', id: next.id, minute: next.minute });
  }

  // Kickoff moved, venue set late, odds flipped on — rare, resync in full.
  if (prev.kickoff !== next.kickoff) {
    return [{ t: 'match', id: next.id, match: next }];
  }

  return out;
}
