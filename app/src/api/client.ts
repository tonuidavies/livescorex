import Constants from 'expo-constants';
import type {
  LeagueGroup, MatchDetail, MatchesResponse, Standings, League,
} from './types';

/**
 * On a physical Android device `localhost` is the phone, not your Mac. Set
 * EXPO_PUBLIC_API_URL to your machine's LAN address (e.g. http://192.168.1.20:8787)
 * or the deployed origin.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:8787';

export const WS_URL = API_URL.replace(/^http/, 'ws') + '/v1/stream';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new ApiError(`GET ${path} failed`, res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  leagues: () =>
    get<{ leagues: League[]; defaults: string[]; oddsEnabled: boolean }>('/v1/leagues'),

  matches: (date: string, leagues?: string[]) => {
    const q = new URLSearchParams({ date });
    if (leagues?.length) q.set('leagues', leagues.join(','));
    return get<MatchesResponse>(`/v1/matches?${q}`);
  },

  live: (leagues?: string[]) => {
    const q = new URLSearchParams();
    if (leagues?.length) q.set('leagues', leagues.join(','));
    return get<{ groups: LeagueGroup[]; serverTime: number }>(`/v1/live?${q}`);
  },

  detail: (id: string, leagueSlug: string) =>
    get<MatchDetail>(`/v1/matches/${encodeURIComponent(id)}?league=${leagueSlug}`, 20_000),

  standings: (slug: string) =>
    get<Standings>(`/v1/standings/${encodeURIComponent(slug)}`, 20_000),
};
