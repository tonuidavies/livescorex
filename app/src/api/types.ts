/** Mirrors server/src/core/schema.ts. Keep the two in step. */

export type MatchState =
  | 'scheduled' | 'live' | 'halftime' | 'finished'
  | 'postponed' | 'cancelled' | 'unknown';

export interface Team { id: string; name: string; shortName: string; crest: string | null }

export interface League {
  slug: string; name: string; country: string; countryName: string;
  flag: string | null; logo: string | null; tier: 1 | 2;
}

export interface MatchEvent {
  id: string; minute: number | null; plus: number | null;
  type: 'goal' | 'own-goal' | 'penalty' | 'penalty-missed' | 'yellow' | 'red'
      | 'second-yellow' | 'substitution' | 'var' | 'period' | 'other';
  side: 'home' | 'away' | null;
  playerName: string | null; playerOutName: string | null;
  text: string | null; score: { home: number; away: number } | null;
}

export interface TeamStat {
  key: string; label: string; home: string; away: string; homeShare: number | null;
}

export interface LineupPlayer {
  id: string; name: string; shortName: string; number: number | null;
  position: string | null; starter: boolean;
  x: number | null; y: number | null;
  yellow: boolean; red: boolean; subbedOff: boolean;
}

export interface TeamLineup {
  formation: string | null; players: LineupPlayer[]; hasPitchPositions: boolean;
}

export interface StandingRow {
  rank: number; team: Team; played: number; wins: number; draws: number;
  losses: number; goalDiff: number; points: number; marker: string | null;
}

export interface Standings {
  leagueSlug: string; groupName: string | null; rows: StandingRow[]; updatedAt: number;
}

export interface Odds { home: number; draw: number | null; away: number; provider: string | null }

export interface Match {
  id: string; league: League; kickoff: number; state: MatchState;
  minute: number | null; statusLabel: string;
  home: Team; away: Team;
  score: { home: number | null; away: number | null };
  halftimeScore: { home: number; away: number } | null;
  venue: string | null; odds: Odds | null; updatedAt: number; source: string;
}

export interface MatchDetail {
  match: Match;
  events: MatchEvent[];
  stats: TeamStat[];
  lineups: { home: TeamLineup; away: TeamLineup } | null;
  standings: Standings | null;
  headToHead: Match[];
  available: { summary: boolean; statistics: boolean; lineup: boolean; standings: boolean };
}

export interface LeagueGroup {
  league: League;
  fetchedAt: number;
  /** Server is serving last-known-good because every source failed. */
  stale: boolean;
  matches: Match[];
}

export interface MatchesResponse { date: string; groups: LeagueGroup[]; serverTime: number }

export type Delta =
  | { t: 'score'; id: string; home: number; away: number; minute: number | null }
  | { t: 'state'; id: string; state: MatchState; statusLabel: string; minute: number | null }
  | { t: 'minute'; id: string; minute: number }
  | { t: 'event'; id: string; event: MatchEvent }
  | { t: 'match'; id: string; match: Match }
  | { t: 'gone'; id: string };

export interface DeltaFrame { seq: number; ts: number; deltas: Delta[] }
