import type { Match } from './schema.js';

/**
 * Cross-source match merging.
 *
 * Two feeds describe the same fixture with different ids, slightly different
 * team names and different depth. Without merging, every big match appears
 * twice; with naive merging, two genuinely different fixtures collapse into
 * one. Both failures are visible and bad, so identity is deliberately
 * conservative: a pair must agree on *both* teams and kick off within two
 * hours of each other before they are considered the same match.
 */

const CLUB_NOISE = new Set([
  'fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'ca', 'sv', 'bk', 'if', 'sk', 'fk',
  'club', 'clube', 'cfc', 'ss', 'as', 'us', 'ud', 'rc', 'cs', 'sd', 'sg',
  'de', 'do', 'da', 'del', 'la', 'el', 'los', 'the', 'and', 'y',
  'united', 'utd', 'city', 'town', 'athletic', 'atletico', 'atlético',
  'sporting', 'real', 'deportivo', 'racing', 'olympique', 'olympic',
]);

export function normaliseTeam(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function core(name: string): string[] {
  const all = normaliseTeam(name);
  const kept = all.filter(w => !CLUB_NOISE.has(w));
  // "Real Madrid" and "Racing Club" would otherwise reduce to nothing; if the
  // noise filter empties a name, keep it whole.
  return kept.length ? kept : all;
}

/** True when two names plausibly denote the same club. */
export function sameTeam(a: string, b: string): boolean {
  const A = core(a);
  const B = core(b);
  if (A.length === 0 || B.length === 0) return false;

  const sa = A.join(' ');
  const sb = B.join(' ');
  if (sa === sb) return true;

  const setA = new Set(A);
  const setB = new Set(B);
  const inter = [...setA].filter(w => setB.has(w)).length;
  if (inter / Math.min(setA.size, setB.size) >= 0.75) return true;

  // Abbreviations: "Man Utd" against "Manchester United", "Wolves" against
  // "Wolverhampton Wanderers". Every token on the shorter side must prefix a
  // token on the longer side.
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  const prefixed = short.every(s =>
    long.some(l => (s.length >= 3 && l.startsWith(s)) || (l.length >= 3 && s.startsWith(l))),
  );
  return prefixed;
}

const TWO_HOURS = 2 * 3600_000;

export function sameMatch(a: Match, b: Match): boolean {
  if (Math.abs(a.kickoff - b.kickoff) > TWO_HOURS) return false;
  return sameTeam(a.home.name, b.home.name) && sameTeam(a.away.name, b.away.name);
}

/**
 * How much detail each source can put on the match screen — ratings, coaches,
 * xG, grouped stats. Used to break ties once a match has started, when that
 * depth is the whole difference between the two records.
 */
const DETAIL_DEPTH: Record<string, number> = {
  fotmob: 8,
  espn: 3,
};

/**
 * How much a record is worth keeping when two sources describe one fixture.
 *
 * A second-level clock dominates everything else — it is the whole reason a
 * second source was added — but a record with no score at all loses to one
 * that has it, so a temporarily empty payload never wins.
 *
 * Two subtleties learned from real matches:
 *
 *  - Odds only count before kick-off. They are hidden once a match starts, so
 *    letting them win a merge for a finished game traded away the ratings and
 *    coaches on the detail screen for a value nothing renders.
 *  - Once a match has started, detail depth breaks the tie. Without it the
 *    winner depended on which source happened to write to the store first.
 */
function score(m: Match): number {
  let s = 0;
  if (m.clockSeconds !== null) s += 100;
  if (m.score.home !== null) s += 20;
  if (m.state === 'live' || m.state === 'halftime') s += 10;
  if (m.home.crest) s += 4;
  if (m.odds && m.state === 'scheduled') s += 3;
  if (m.minute !== null) s += 2;
  if (m.state !== 'scheduled') s += DETAIL_DEPTH[m.source] ?? 0;
  return s;
}

export interface MergeResult {
  matches: Match[];
  /** Canonical id -> every source id that resolved to it, for detail routing. */
  aliases: Map<string, string[]>;
  duplicatesResolved: number;
}

/**
 * Merge match lists from several sources into one deduplicated slate.
 *
 * Input order is priority order only as a tiebreak; the richer record wins on
 * merit so a source being listed first never costs the user a live clock.
 */
export function mergeMatches(lists: Match[][]): MergeResult {
  const chosen: Match[] = [];
  const aliases = new Map<string, string[]>();
  let duplicatesResolved = 0;

  for (const list of lists) {
    for (const candidate of list) {
      const idx = chosen.findIndex(existing => sameMatch(existing, candidate));
      if (idx === -1) {
        chosen.push(candidate);
        aliases.set(candidate.id, [candidate.id]);
        continue;
      }

      duplicatesResolved += 1;
      const existing = chosen[idx]!;
      const keep = score(candidate) > score(existing) ? candidate : existing;
      const drop = keep === candidate ? existing : candidate;

      // Carry across anything the winner happens to lack: odds only come from
      // one source, crests from another, and losing them to a merge would be a
      // regression the user would notice.
      const merged: Match = {
        ...keep,
        odds: keep.odds ?? drop.odds,
        venue: keep.venue ?? drop.venue,
        halftimeScore: keep.halftimeScore ?? drop.halftimeScore,
        home: { ...keep.home, crest: keep.home.crest ?? drop.home.crest },
        away: { ...keep.away, crest: keep.away.crest ?? drop.away.crest },
        league: keep.league.logo ? keep.league : drop.league.logo ? drop.league : keep.league,
      };

      chosen[idx] = merged;
      const prior = aliases.get(existing.id) ?? [existing.id];
      aliases.delete(existing.id);
      aliases.set(merged.id, [...new Set([...prior, candidate.id, merged.id])]);
    }
  }

  return { matches: chosen, aliases, duplicatesResolved };
}
