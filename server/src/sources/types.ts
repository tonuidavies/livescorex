import type { Match, MatchDetail, Standings } from '../core/schema.js';

/**
 * Every data source implements this. Adding a source (FotMob, api-football,
 * Sportmonks) means writing one of these — nothing downstream changes.
 */
export interface Source {
  readonly name: string;

  /**
   * Whether this source can answer a per-league, per-day query.
   *
   * Not every upstream is shaped that way: FotMob returns every competition
   * for a day in one request, so asking it league-by-league would be hundreds
   * of identical calls. The scheduler skips such sources in the league sweep
   * and drives them through their own whole-day path instead.
   */
  readonly supportsLeagueDay: boolean;

  /** Fixtures + live state for one league on one day. */
  fetchLeagueDay(slug: string, yyyymmdd: string): Promise<Match[] | null>;
  /** Everything the detail screen needs. */
  fetchDetail(slug: string, matchId: string): Promise<MatchDetail | null>;
  /** League table for the Table screen. */
  fetchStandings(slug: string): Promise<Standings | null>;
}
