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
  /**
   * Tier 2 is deliberately slow.
   *
   * After removing the 125 competitions FotMob already delivers in one
   * request, ESPN is exclusively responsible for just 8 tier-1 leagues — the
   * Kenyan, Ugandan, Zambian, Zimbabwean and South African top flights, CAF
   * Confederation Cup, the Carabao Cup and CAF World Cup qualifying. Those are
   * the product's reason to exist and stay fast.
   *
   * Everything else ESPN alone carries is a lower division nobody is watching
   * minute by minute, and polling it hard is the bulk of our footprint against
   * a source that could withdraw access at any time. Spending that budget on
   * the eight that matter is the better trade.
   */
  pollLiveTier2: num(process.env.POLL_LIVE_TIER2, 30),

  /**
   * FotMob supplies the second-level match clock, player ratings, coaches and
   * xG that ESPN does not publish for football, and covers roughly four times
   * as many competitions on a busy day. It does not carry the Kenyan Premier
   * League — or Ghana, Uganda, Zambia, Zimbabwe — so it supplements ESPN
   * rather than replacing it.
   */
  fotmobEnabled: process.env.FOTMOB_ENABLED !== 'false',

  /**
   * One request covers every live match on the planet, so the cadence is set
   * by how fresh a goal needs to be rather than by cost.
   *
   * Note this does *not* affect the match clock — that is interpolated on the
   * client and already tracks the source to within a second. It governs goal
   * latency alone: on average half the interval, at worst the whole of it.
   *
   * Adaptive, because polling every two seconds through the small hours when
   * nothing anywhere is in play is pure waste. Idle drops to a slow watch
   * that only needs to notice a kick-off.
   */
  pollFotmobLive: num(process.env.POLL_FOTMOB_LIVE, 2),
  pollFotmobIdle: num(process.env.POLL_FOTMOB_IDLE, 30),

  /**
   * How long a fixture list for a day other than today stays trusted.
   *
   * Fixtures are not static: matches get postponed, moved and rescheduled.
   * Until now a day fetched on demand was cached forever — browse to a date
   * three weeks out and whatever it said then is what it would say for good.
   * Today's slate is exempt because live polling already covers it.
   */
  coldDayTtlMinutes: num(process.env.COLD_DAY_TTL_MINUTES, 30),

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

  /** Overridable so a container can point state at a mounted volume. */
  snapshotPath: join(process.env.SNAPSHOT_DIR ?? join(DATA_DIR, '..'), 'snapshot.json'),
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
