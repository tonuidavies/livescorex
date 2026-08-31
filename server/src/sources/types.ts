import type { Match, MatchDetail, Standings } from '../core/schema.js';

/**
 * Every data source implements this. Adding a source (FotMob, api-football,
 * Sportmonks) means writing one of these — nothing downstream changes.
 */
export interface Source {
  readonly name: string;
  /** Fixtures + live state for one league on one day. */
  fetchLeagueDay(slug: string, yyyymmdd: string): Promise<Match[] | null>;
  /** Everything the detail screen needs. */
  fetchDetail(slug: string, matchId: string): Promise<MatchDetail | null>;
  /** League table for the Table screen. */
  fetchStandings(slug: string): Promise<Standings | null>;
}
