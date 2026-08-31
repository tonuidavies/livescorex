import * as LiveMatch from '../../modules/live-match-notification';
import type { MatchNotificationPayload } from '../../modules/live-match-notification';

/**
 * Translates an FCM data message into a rendered notification.
 *
 * FCM data payloads are string-to-string, and the shape of what reaches JS
 * differs between a foreground listener and a background task — and between
 * Android versions. So rather than trusting one path, `extract` digs for our
 * fields wherever they ended up and everything downstream works from a
 * validated object.
 */

const asString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

const asInt = (v: unknown, fallback = 0): number => {
  const n = Number(asString(v));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const STATES = new Set([
  'scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled', 'unknown',
]);

/** Pull our data block out of whatever wrapper the platform delivered. */
export function extract(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number): Record<string, unknown> | null => {
    if (depth > 5 || !node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    if (asString(obj.type) === 'match-update' && asString(obj.matchId) !== '') return obj;
    for (const value of Object.values(obj)) {
      const hit = walk(value, depth + 1);
      if (hit) return hit;
    }
    return null;
  };

  return walk(raw, 0);
}

export function toPayload(data: Record<string, unknown>): MatchNotificationPayload | null {
  const matchId = asString(data.matchId);
  if (!matchId) return null;

  const stateRaw = asString(data.state);
  const state = (STATES.has(stateRaw) ? stateRaw : 'unknown') as MatchNotificationPayload['state'];

  const minuteRaw = asString(data.minute);
  const minute = minuteRaw === '' ? null : asInt(minuteRaw);

  const goalMinutes = asString(data.goalMinutes)
    .split(',')
    .map(s => Number(s))
    .filter(n => Number.isFinite(n) && n >= 0);

  return {
    matchId,
    leagueName: asString(data.leagueName),
    homeName: asString(data.homeName),
    awayName: asString(data.awayName),
    homeShort: asString(data.homeShort) || asString(data.homeName).slice(0, 3).toUpperCase(),
    awayShort: asString(data.awayShort) || asString(data.awayName).slice(0, 3).toUpperCase(),
    homeCrest: asString(data.homeCrest) || null,
    awayCrest: asString(data.awayCrest) || null,
    homeScore: asInt(data.homeScore),
    awayScore: asInt(data.awayScore),
    minute,
    statusLabel: asString(data.statusLabel),
    state,
    goalMinutes,
    ongoing: asString(data.ongoing) === '1',
    alert: asString(data.alert) === '1',
    deepLink: `livescorex://match/${encodeURIComponent(matchId)}`,
  };
}

/**
 * Handle one incoming message. Safe to call from a background task.
 *
 * A finished match dismisses its notification rather than leaving a dead
 * fixture pinned to the shade — the single most common complaint about
 * ongoing notifications is that they outstay their welcome.
 */
export async function handleMessage(raw: unknown): Promise<boolean> {
  const data = extract(raw);
  if (!data) return false;

  const payload = toPayload(data);
  if (!payload) return false;

  if (!LiveMatch.isAvailable) return false;

  if (payload.state === 'postponed' || payload.state === 'cancelled') {
    await LiveMatch.dismiss(payload.matchId);
    return true;
  }

  await LiveMatch.show(payload);

  // Full time: leave it up briefly so the result registers, then clear it.
  if (payload.state === 'finished') {
    setTimeout(() => {
      void LiveMatch.dismiss(payload.matchId).catch(() => {});
    }, 5 * 60_000);
  }

  return true;
}
