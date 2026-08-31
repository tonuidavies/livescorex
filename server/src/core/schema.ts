/**
 * Canonical schema. Every source adapter normalises into these shapes, and the
 * app only ever sees these. Adding a source must never change this file.
 *
 * Design rule: every field the UI renders is either present or explicitly null.
 * A source that cannot supply something sets null so the UI can hide the block
 * instead of rendering an empty one. Never use `undefined` to mean "missing".
 */

export type MatchState =
  | 'scheduled'   // kickoff in the future
  | 'live'        // in progress
  | 'halftime'
  | 'finished'
  | 'postponed'
  | 'cancelled'
  | 'unknown';

export interface Team {
  id: string;            // canonical id: `${source}:${sourceId}`
  name: string;          // display name, e.g. "Gor Mahia"
  shortName: string;     // e.g. "GOR"
  crest: string | null;  // absolute URL
}

export interface League {
  /** ESPN-style slug, e.g. "ken.1", "eng.1", "uefa.champions" */
  slug: string;
  name: string;
  /** ISO-ish country/confederation code derived from the slug, e.g. "ken" */
  country: string;
  countryName: string;
  flag: string | null;
  logo: string | null;
  /** Light-on-dark variant. Many competition marks are near-black artwork and
   *  vanish on a dark background, so the app picks by theme. */
  logoDark: string | null;
  tier: 1 | 2;
}

/** A single timeline entry on the Summary tab. */
export interface MatchEvent {
  id: string;
  minute: number | null;
  /** stoppage-time offset, e.g. 45+2 -> minute 45, plus 2 */
  plus: number | null;
  type: 'goal' | 'own-goal' | 'penalty' | 'penalty-missed' | 'yellow' | 'red'
      | 'second-yellow' | 'substitution' | 'var' | 'period' | 'other';
  side: 'home' | 'away' | null;
  playerName: string | null;
  /** substitution: player coming off */
  playerOutName: string | null;
  text: string | null;
  /** score immediately after this event, when the source provides it */
  score: { home: number; away: number } | null;
}

/** One row on the Statistics tab. Values are pre-formatted for display. */
export interface TeamStat {
  key: string;                // 'possession', 'shots', ...
  label: string;              // 'Ball Possession'
  home: string;
  away: string;
  /** 0..1 share for the bar fill, when the stat is comparable */
  homeShare: number | null;
}

export interface LineupPlayer {
  id: string;
  name: string;
  shortName: string;
  number: number | null;
  position: string | null;
  starter: boolean;
  /** Normalised pitch coordinates, 0..1. x = touchline-to-touchline,
   *  y = own goal (0) to opposition goal (1). null when the source has no
   *  formation grid — the UI then falls back to a list. */
  x: number | null;
  y: number | null;
  yellow: boolean;
  red: boolean;
  subbedOff: boolean;
}

export interface TeamLineup {
  formation: string | null;   // "4-2-3-1"
  players: LineupPlayer[];    // starters + bench
  /** true when at least one starter has usable x/y */
  hasPitchPositions: boolean;
}

export interface StandingRow {
  rank: number;
  team: Team;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDiff: number;
  points: number;
  /** e.g. 'champions-league' | 'relegation' — drives the coloured edge bar */
  marker: string | null;
}

export interface Standings {
  leagueSlug: string;
  groupName: string | null;
  rows: StandingRow[];
  updatedAt: number;
}

/** Odds are optional and gated behind a feature flag — see config.oddsEnabled. */
/** Decimal odds. Sources quote American moneylines; conversion happens in the
 *  adapter so the app never sees a format question. */
export interface Odds {
  home: number;
  draw: number | null;
  away: number;
  provider: string | null;
}

export interface Match {
  id: string;
  league: League;
  /** epoch ms of kickoff */
  kickoff: number;
  state: MatchState;
  /** minute of play when live; null otherwise */
  minute: number | null;
  /**
   * When `minute` was observed, epoch ms.
   *
   * Sources publish the clock in whole-minute steps that only change about
   * once a minute, so a displayed minute is up to ~60s stale however fast we
   * poll. The client interpolates forward from this timestamp, which closes
   * essentially all of the perceived lag.
   */
  minuteAsOf: number | null;
  /** short status label from the source, e.g. "FT", "HT", "76'" */
  statusLabel: string;
  home: Team;
  away: Team;
  score: { home: number | null; away: number | null };
  halftimeScore: { home: number; away: number } | null;
  venue: string | null;
  odds: Odds | null;
  /** when this record was last confirmed against a source */
  updatedAt: number;
  /** which adapter produced it — surfaced in /health, never in the UI */
  source: string;
}

/** Everything the match-detail screen needs, fetched on demand. */
/** Context shown above the timeline: where, who officiated, how many came. */
export interface MatchInfo {
  venue: string | null;
  city: string | null;
  country: string | null;
  attendance: number | null;
  referee: string | null;
  /** Other named officials, when the source lists them. */
  officials: string[];
}

export interface MatchDetail {
  match: Match;
  info: MatchInfo;
  events: MatchEvent[];
  stats: TeamStat[];
  lineups: { home: TeamLineup; away: TeamLineup } | null;
  standings: Standings | null;
  headToHead: Match[];
  /** Which detail tabs this league can actually populate. The app hides the
   *  rest rather than rendering an empty tab. */
  available: {
    summary: boolean;
    statistics: boolean;
    lineup: boolean;
    standings: boolean;
    headToHead: boolean;
    info: boolean;
  };
}

/* ---------------------------------------------------------------------------
 * Realtime deltas
 * A goal is ~200 bytes on the wire instead of a 200KB scoreboard refetch.
 * Matters more than latency on a Kenyan data bundle.
 * ------------------------------------------------------------------------- */

export type Delta =
  | { t: 'score'; id: string; home: number; away: number; minute: number | null }
  | { t: 'state'; id: string; state: MatchState; statusLabel: string; minute: number | null }
  | { t: 'minute'; id: string; minute: number }
  | { t: 'event'; id: string; event: MatchEvent }
  | { t: 'match'; id: string; match: Match }        // full record: new or resynced
  | { t: 'gone'; id: string };                      // postponed off the slate

export interface DeltaFrame {
  /** monotonic per-server sequence so clients can detect gaps and resync */
  seq: number;
  ts: number;
  deltas: Delta[];
}
