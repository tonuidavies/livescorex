import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(here, '..', 'data');

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  port: num(process.env.PORT, 8787),

  /**
   * Poll cadence in seconds while a league has a match in progress.
   *
   * Upstream publishes the match clock in whole-minute steps that change only
   * about once a minute, so polling faster than this buys nothing for the
   * *minute* — the client interpolates that. It does buy goal freshness, which
   * is what people actually notice, so these are deliberately tight and the
   * state-aware scheduler keeps the volume affordable anyway.
   */
  pollLiveTier1: num(process.env.POLL_LIVE_TIER1, 5),
  pollLiveTier2: num(process.env.POLL_LIVE_TIER2, 12),

  /**
   * FotMob supplies the second-level match clock, player ratings, coaches and
   * xG that ESPN does not publish for football, and covers roughly four times
   * as many competitions on a busy day. It does not carry the Kenyan Premier
   * League — or Ghana, Uganda, Zambia, Zimbabwe — so it supplements ESPN
   * rather than replacing it.
   */
  fotmobEnabled: process.env.FOTMOB_ENABLED !== 'false',

  /** One request covers every live match worldwide, so this can be tight. */
  pollFotmob: num(process.env.POLL_FOTMOB, 6),

  /** Local hour for the daily full-catalog fixture sweep. */
  sweepHour: num(process.env.SWEEP_HOUR, 4),

  /** Start polling this long before kickoff, keep going this long after the
   *  last known minute — covers stoppage time and delayed kickoffs. */
  preKickoffLeadMs: 10 * 60_000,
  postMatchGraceMs: 20 * 60_000,

  /**
   * Odds ship dark. Displaying odds is generally fine, but linking to a
   * bookmaker or taking affiliate revenue makes this a gambling app under
   * Google Play policy — which in Kenya means BCLB licensing, an 18+ rating
   * and reduced AdMob demand. Flip this only once that is settled.
   */
  oddsEnabled: process.env.ODDS_ENABLED === 'true',

  /** Advertised so upstream ops teams can contact you instead of blocking you. */
  contactUrl: process.env.CONTACT_URL ?? 'https://livescorex.app/contact',

  tier1Extra: (process.env.TIER1_EXTRA ?? '').split(',').map(s => s.trim()).filter(Boolean),

  snapshotPath: join(DATA_DIR, '..', 'snapshot.json'),
  snapshotIntervalMs: 60_000,
} as const;

/**
 * Bare product token only.
 *
 * ESPN sits behind Akamai, whose bot rules reject a User-Agent containing a
 * parenthetical — `LivescoreX/0.1` returns 200 while
 * `LivescoreX/0.1 (+https://…)` returns 403. Verified against the live edge.
 * The contact detail moves to its own header so we stay reachable without
 * tripping the rule.
 */
export const userAgent = 'LivescoreX/0.1';

export function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as T;
}
