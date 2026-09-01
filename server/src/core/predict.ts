import type { Match, Standings, StandingRow } from './schema.js';

/**
 * Match forecast from a Poisson goals model.
 *
 * Deliberately not a black box. Each side's scoring rate is estimated from
 * league-relative attack and defence strength — goals scored and conceded per
 * game against the division average — then the two rates are crossed over a
 * scoreline grid to give 1X2, both-teams-to-score, over/under and the most
 * likely results. It is the standard approach for football because goals are
 * close to Poisson-distributed and it needs only data we already hold.
 *
 * What it is not: it has no knowledge of injuries, suspensions, motivation,
 * weather or team news, and early in a season the sample is tiny. The output
 * carries a confidence grade so the app can say so rather than implying more
 * certainty than a league table can support.
 */

export interface Forecast {
  /** Probabilities, summing to 1. */
  home: number;
  draw: number;
  away: number;
  /** Modelled goal expectancy for the remainder of the match. */
  expected: { home: number; away: number };
  bothTeamsScore: number;
  overTwoFive: number;
  /** Most likely final scorelines, highest first. */
  scorelines: Array<{ home: number; away: number; p: number }>;
  /** How much to trust it, driven by sample size. */
  confidence: 'low' | 'medium' | 'high';
  /** Plain-language drivers, shown under the bars. */
  basis: string[];
  /** True when the current score and time remaining were folded in. */
  inPlay: boolean;
}

/** Typical home edge in league football: roughly a quarter of a goal. */
const HOME_ADVANTAGE = 1.18;
const MAX_GOALS = 8;

const factorial = (n: number): number => {
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
};

const poisson = (k: number, lambda: number): number =>
  (Math.exp(-lambda) * lambda ** k) / factorial(k);

interface Strength {
  attack: number;
  defence: number;
  played: number;
}

function strengthOf(row: StandingRow, leagueAvgGoals: number): Strength {
  const played = Math.max(1, row.played);
  const scored = row.goalsFor / played;
  const conceded = row.goalsAgainst / played;
  return {
    // 1.0 means exactly average; 1.3 means 30% more productive than the league.
    attack: leagueAvgGoals > 0 ? scored / leagueAvgGoals : 1,
    defence: leagueAvgGoals > 0 ? conceded / leagueAvgGoals : 1,
    played: row.played,
  };
}

function findRow(table: Standings, teamId: string, name: string): StandingRow | null {
  const byId = table.rows.find(r => r.team.id === teamId);
  if (byId) return byId;
  // Ids differ across sources; fall back to a normalised name match.
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const target = norm(name);
  return table.rows.find(r => norm(r.team.name) === target)
    ?? table.rows.find(r => norm(r.team.name).includes(target) || target.includes(norm(r.team.name)))
    ?? null;
}

export function forecast(match: Match, table: Standings | null): Forecast | null {
  if (!table || table.rows.length < 4) return null;

  const homeRow = findRow(table, match.home.id, match.home.name);
  const awayRow = findRow(table, match.away.id, match.away.name);
  if (!homeRow || !awayRow) return null;

  const totalGames = table.rows.reduce((n, r) => n + r.played, 0);
  const totalGoals = table.rows.reduce((n, r) => n + r.goalsFor, 0);
  if (totalGames === 0 || totalGoals === 0) return null;

  // Average goals scored by one team in one game.
  const leagueAvgGoals = totalGoals / totalGames;

  const h = strengthOf(homeRow, leagueAvgGoals);
  const a = strengthOf(awayRow, leagueAvgGoals);

  let lambdaHome = h.attack * a.defence * leagueAvgGoals * HOME_ADVANTAGE;
  let lambdaAway = a.attack * h.defence * leagueAvgGoals;

  // Keep the model away from absurdities when a table is tiny or lopsided.
  lambdaHome = Math.min(6, Math.max(0.15, lambdaHome));
  lambdaAway = Math.min(6, Math.max(0.15, lambdaAway));

  /*
   * In play: only the remaining minutes are still to be scored in, and the
   * goals already on the board are certain. A 2-0 lead at 80' should read as
   * nearly settled, which a pre-match model would never say.
   */
  const inPlay = match.state === 'live' || match.state === 'halftime';
  const minute = match.minute ?? (match.state === 'halftime' ? 45 : 0);
  const remaining = inPlay ? Math.max(0, Math.min(1, (90 - minute) / 90)) : 1;
  const scoredHome = inPlay ? (match.score.home ?? 0) : 0;
  const scoredAway = inPlay ? (match.score.away ?? 0) : 0;

  const lh = lambdaHome * remaining;
  const la = lambdaAway * remaining;

  let pHome = 0, pDraw = 0, pAway = 0, pBtts = 0, pOver = 0;
  const grid: Array<{ home: number; away: number; p: number }> = [];

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poisson(i, lh) * poisson(j, la);
      if (p < 1e-6) continue;
      const finalHome = scoredHome + i;
      const finalAway = scoredAway + j;

      if (finalHome > finalAway) pHome += p;
      else if (finalHome === finalAway) pDraw += p;
      else pAway += p;

      if (finalHome > 0 && finalAway > 0) pBtts += p;
      if (finalHome + finalAway > 2.5) pOver += p;

      grid.push({ home: finalHome, away: finalAway, p });
    }
  }

  const total = pHome + pDraw + pAway || 1;
  const scorelines = grid
    .sort((x, y) => y.p - x.p)
    .slice(0, 3)
    .map(s => ({ ...s, p: s.p / total }));

  const sample = Math.min(h.played, a.played);
  const confidence: Forecast['confidence'] =
    sample >= 10 ? 'high' : sample >= 4 ? 'medium' : 'low';

  const basis: string[] = [];
  basis.push(
    `${match.home.name} score ${(homeRow.goalsFor / Math.max(1, homeRow.played)).toFixed(1)} ` +
    `and concede ${(homeRow.goalsAgainst / Math.max(1, homeRow.played)).toFixed(1)} per game`,
  );
  basis.push(
    `${match.away.name} score ${(awayRow.goalsFor / Math.max(1, awayRow.played)).toFixed(1)} ` +
    `and concede ${(awayRow.goalsAgainst / Math.max(1, awayRow.played)).toFixed(1)} per game`,
  );
  basis.push(`League average ${leagueAvgGoals.toFixed(2)} goals per team per game`);
  if (homeRow.rank && awayRow.rank) {
    basis.push(`${homeRow.rank}${ordinal(homeRow.rank)} against ${awayRow.rank}${ordinal(awayRow.rank)} in the table`);
  }
  if (inPlay) basis.push(`Adjusted for ${minute}' and the current score`);
  if (sample < 4) basis.push(`Only ${sample} matches played so far — treat with caution`);

  return {
    home: pHome / total,
    draw: pDraw / total,
    away: pAway / total,
    expected: { home: scoredHome + lh, away: scoredAway + la },
    bothTeamsScore: pBtts / total,
    overTwoFive: pOver / total,
    scorelines,
    confidence,
    basis,
    inPlay,
  };
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
