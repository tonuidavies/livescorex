import Constants from 'expo-constants';
import type {
  LeagueGroup, MatchDetail, MatchesResponse, Standings, League, Sport,
} from './types';
import { observeServerTime } from '../util/serverClock';

/**
 * Where the API lives.
 *
 * On a physical device `localhost` is the phone, not your machine, so the
 * build-time default comes from EXPO_PUBLIC_API_URL. It is also overridable at
 * runtime from Settings: an installed APK otherwise has to be rebuilt every
 * time the dev machine's LAN address changes, which makes testing on a real
 * phone far more painful than it needs to be.
 */
export const DEFAULT_API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:8787';

let currentApiUrl = DEFAULT_API_URL;

/** Normalise so a user typing "192.168.1.5:8787" still works. */
export function normaliseApiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed === '') return DEFAULT_API_URL;
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function setApiUrl(url: string | null): void {
  currentApiUrl = url ? normaliseApiUrl(url) : DEFAULT_API_URL;
}

export function getApiUrl(): string {
  return currentApiUrl;
}

export function getWsUrl(): string {
  return currentApiUrl.replace(/^http/, 'ws') + '/v1/stream';
}

/** Quick reachability probe for the Settings screen. */
export async function pingServer(url: string, timeoutMs = 6000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${normaliseApiUrl(url)}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const sentAt = Date.now();
  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new ApiError(`GET ${path} failed`, res.status);
    const body = (await res.json()) as T;
    // Every response that carries the server's clock is a free skew sample.
    const st = (body as { serverTime?: number } | null)?.serverTime;
    if (typeof st === 'number') observeServerTime(st, sentAt, Date.now());
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  sports: () => get<{ sports: Sport[] }>('/v1/sports'),

  /** Where to send someone who picked an out-of-season sport. */
  nextFixtures: (sport: string, from: string) =>
    get<{ next: { day: string; count: number; league: string } | null }>(
      `/v1/next-fixtures?sport=${sport}&from=${from}`,
      30_000,
    ),

  leagues: (sport?: string) => {
    const q = new URLSearchParams();
    if (sport) q.set('sport', sport);
    return get<{
      leagues: League[]; sports: Sport[]; defaults: string[]; oddsEnabled: boolean;
    }>(`/v1/leagues?${q}`);
  },

  matches: (date: string, leagues?: string[], sport = 'soccer') => {
    const q = new URLSearchParams({ date, sport });
    if (leagues?.length) q.set('leagues', leagues.join(','));
    // A day the server has never fetched is filled on demand, which takes a
    // few seconds. The default 12s timeout aborted those requests and left
    // the previous day's list on screen, which read as "tapping a date does
    // nothing".
    return get<MatchesResponse>(`/v1/matches?${q}`, 25_000);
  },

  live: (leagues?: string[], sport = 'soccer') => {
    const q = new URLSearchParams({ sport });
    if (leagues?.length) q.set('leagues', leagues.join(','));
    return get<{ groups: LeagueGroup[]; serverTime: number }>(`/v1/live?${q}`);
  },

  detail: (id: string, leagueSlug: string) =>
    get<MatchDetail>(`/v1/matches/${encodeURIComponent(id)}?league=${leagueSlug}`, 20_000),

  standings: (slug: string) =>
    get<Standings>(`/v1/standings/${encodeURIComponent(slug)}`, 20_000),
};
