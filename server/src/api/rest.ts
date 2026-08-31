import type { IncomingMessage, ServerResponse } from 'node:http';
import { store } from '../core/store.js';
import { LEAGUES, DEFAULT_LEAGUES } from '../catalog.js';
import type { Scheduler } from '../core/scheduler.js';
import { dayKey } from '../core/scheduler.js';
import { config } from '../config.js';
import { devices } from '../core/devices.js';

/** Bounded body read — an unbounded one is a trivial memory DoS. */
async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 16_384) return null;
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function json(res: ServerResponse, code: number, body: unknown, cacheSeconds = 0): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

interface NotifierLike {
  health(): unknown;
  simulate(matchId: string, kind?: 'goal' | 'kickoff' | 'halftime' | 'fulltime' | 'update'):
    Promise<{ sent: number; match: string } | null>;
}

export function createRestHandler(sched: Scheduler, notifier?: NotifierLike) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'POST') {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      /* Development helper: fire a real notification for a real match without
       * waiting for an actual goal. Off unless DEBUG_PUSH=true. */
      if (url.pathname === '/v1/debug/push') {
        if (process.env.DEBUG_PUSH !== 'true') {
          return json(res, 404, { error: 'not found' });
        }
        const body = await readBody(req);
        const matchId = String(body?.matchId ?? '');
        const kind = String(body?.kind ?? 'goal') as 'goal';
        if (!matchId) return json(res, 400, { error: 'matchId required' });
        const out = await notifier?.simulate(matchId, kind);
        if (!out) return json(res, 404, { error: 'unknown match', matchId });
        return json(res, 200, { ok: true, ...out, kind });
      }

      if (url.pathname === '/v1/devices') {
        const body = await readBody(req);
        if (!body?.token) return json(res, 400, { error: 'token required' });
        devices.upsert({
          token: String(body.token),
          platform: String(body.platform ?? 'unknown'),
          teams: Array.isArray(body.teams) ? body.teams.map(String) : [],
          leagues: Array.isArray(body.leagues) ? body.leagues.map(String) : [],
        });
        return json(res, 200, { ok: true, registered: devices.count() });
      }
      return json(res, 404, { error: 'not found' });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const p = url.pathname;

    try {
      if (p === '/health' || p === '/v1/health') {
        return json(res, 200, {
          ok: true, uptime: process.uptime(), devices: devices.count(),
          push: notifier?.health() ?? null, ...sched.health(),
        });
      }

      if (p === '/v1/leagues') {
        return json(res, 200, {
          leagues: LEAGUES,
          defaults: DEFAULT_LEAGUES,
          oddsEnabled: config.oddsEnabled,
        }, 3600);
      }

      /* Fixtures for a day, grouped by league.
       * `leagues` filters to the user's selection — with 259 competitions an
       * unfiltered list is thousands of rows on a Saturday. */
      if (p === '/v1/matches') {
        const date = url.searchParams.get('date') ?? dayKey();
        const filter = url.searchParams.get('leagues');
        const wanted = filter ? new Set(filter.split(',').filter(Boolean)) : null;

        const groups = store
          .getDay(date)
          .filter(g => g.matches.length > 0)
          .filter(g => !wanted || wanted.has(g.matches[0]!.league.slug))
          .map(g => ({
            league: g.matches[0]!.league,
            fetchedAt: g.fetchedAt,
            stale: g.stale,
            matches: [...g.matches].sort((a, b) => a.kickoff - b.kickoff),
          }))
          .sort((a, b) =>
            a.league.tier - b.league.tier ||
            a.league.countryName.localeCompare(b.league.countryName) ||
            a.league.name.localeCompare(b.league.name));

        return json(res, 200, { date, groups, serverTime: Date.now() });
      }

      /* Only matches in progress. The Live tab reads this. */
      if (p === '/v1/live') {
        const filter = url.searchParams.get('leagues');
        const wanted = filter ? new Set(filter.split(',').filter(Boolean)) : null;

        const live = store.liveMatches()
          .filter(m => !wanted || wanted.has(m.league.slug));

        const bySlug = new Map<string, typeof live>();
        for (const m of live) {
          const arr = bySlug.get(m.league.slug) ?? [];
          arr.push(m);
          bySlug.set(m.league.slug, arr);
        }

        const groups = [...bySlug.values()]
          .map(matches => ({
            league: matches[0]!.league,
            fetchedAt: Math.max(...matches.map(m => m.updatedAt)),
            stale: false,
            matches: matches.sort((a, b) => a.kickoff - b.kickoff),
          }))
          .sort((a, b) =>
            a.league.tier - b.league.tier ||
            a.league.countryName.localeCompare(b.league.countryName));

        return json(res, 200, { groups, serverTime: Date.now() });
      }

      const detail = p.match(/^\/v1\/matches\/(.+)$/);
      if (detail?.[1]) {
        const id = decodeURIComponent(detail[1]);
        const known = store.getMatch(id);
        // `||` not `??`: a deep link from a notification sends `league=` empty,
        // and an empty string must fall through to the known match's league.
        const slug = url.searchParams.get('league') || known?.league.slug;
        if (!slug) return json(res, 404, { error: 'unknown match' });
        const d = await sched.fetchDetail(slug, id);
        if (!d) return json(res, 503, { error: 'detail unavailable', match: known ?? null });
        return json(res, 200, d);
      }

      const standings = p.match(/^\/v1\/standings\/(.+)$/);
      if (standings?.[1]) {
        const slug = decodeURIComponent(standings[1]);
        await sched.ensureStandings(slug);
        const s = store.getStandings(slug);
        if (!s) return json(res, 404, { error: 'no standings for league', slug });
        return json(res, 200, s);
      }

      return json(res, 404, { error: 'not found' });
    } catch (err) {
      console.error('[rest]', p, err);
      return json(res, 500, { error: 'internal' });
    }
  };
}
