import type {
  League, LineupPlayer, Match, MatchDetail, MatchEvent, MatchInfo, MatchState,
  StandingRow, Standings, Team, TeamLineup, TeamStat,
} from '../core/schema.js';
import type { Source } from './types.js';
import { getJson } from '../util/http.js';
import { canonicalLeagueSlug, countryName, fotmobKeyFor, getLeague } from '../catalog.js';

/**
 * FotMob adapter.
 *
 * Why a second source at all: this one publishes the match clock to the second
 * (`"68:05"`), plus player ratings, coaches, xG and real pitch coordinates —
 * none of which ESPN provides for football. It also covers noticeably more
 * competitions on a busy day (148 leagues / 547 matches on a Saturday against
 * roughly 40 from ESPN).
 *
 * Why it does not simply replace ESPN: its league list contains no Kenyan
 * Premier League — verified against its own `allLeagues` index, 569 entries,
 * zero hits — nor Ghana, Uganda, Zambia or Zimbabwe. For an app built for
 * Nairobi that is disqualifying on its own, so the two run side by side and
 * the merge layer decides per match.
 */

const BASE = 'https://www.fotmob.com/api/data';

/** This host serves browser traffic and rejects non-browser clients. */
const HEADERS_NOTE = 'browser UA required';

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

/* --------------------------------------------------------------- identity */

/** FotMob league ids are numeric; namespace them so they cannot collide. */
function leagueOf(raw: any): League {
  const cc = String(raw?.ccode ?? '').toLowerCase();
  const id = raw?.primaryId ?? raw?.id;

  // Where the competition also exists in the ESPN catalogue, adopt that
  // identity wholesale so both sources group under one heading with one logo.
  const native = `fotmob:${id}`;
  const canonical = canonicalLeagueSlug(native);
  if (canonical !== native) return getLeague(canonical);

  return {
    slug: `fotmob:${id}`,
    // FotMob is football only; other sports come from ESPN.
    sport: 'soccer',
    sportName: 'Football',
    name: str(raw?.name) ?? `League ${id}`,
    country: cc || 'int',
    countryName: cc ? countryName(cc) : 'International',
    flag: null,
    logo: id ? `https://images.fotmob.com/image_resources/logo/leaguelogo/${id}.png` : null,
    logoDark: id ? `https://images.fotmob.com/image_resources/logo/leaguelogo/dark/${id}.png` : null,
    tier: 2,
  };
}

function teamOf(raw: any): Team {
  const id = raw?.id;
  const name = str(raw?.longName) ?? str(raw?.name) ?? 'Unknown';
  return {
    id: `fotmob:${id ?? name}`,
    name,
    shortName: str(raw?.shortName) ?? name.slice(0, 3).toUpperCase(),
    crest: id
      ? `https://images.fotmob.com/image_resources/logo/teamlogo/${id}_small.png`
      : null,
  };
}

/* ------------------------------------------------------------------ clock */

/** `"68:05"` -> 4085 seconds. */
function parseClockSeconds(long: unknown): number | null {
  const t = String(long ?? '');
  const m = t.match(/^(\d+):(\d{2})$/);
  if (!m?.[1] || !m[2]) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Half time is announced in the clock string, not as a flag.
 *
 * There is no `firstHalfEnded` in the payload — during the interval `liveTime`
 * simply reads `"Half-Time"` / `"HT"` while `secondHalfStarted` is still
 * absent. Looking for a flag that never arrives left every interval showing as
 * live at 0', because stripping non-digits from `"HT"` yields an empty string
 * and `Number('')` is 0.
 */
function isHalfTime(status: any): boolean {
  const long = String(status?.liveTime?.long ?? '').toLowerCase();
  const short = String(status?.liveTime?.short ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (long.includes('half-time') || long.includes('half time')) return true;
  if (short === 'HT') return true;
  const halfs = status?.halfs ?? {};
  return Boolean(halfs.firstHalfStarted) && !halfs.secondHalfStarted
    && String(status?.liveTime?.long ?? '').includes(':') === false;
}

function mapState(status: any): MatchState {
  if (status?.cancelled) return 'cancelled';
  if (status?.finished) return 'finished';
  if (status?.started) return isHalfTime(status) ? 'halftime' : 'live';
  const reason = String(status?.reason?.short ?? '').toLowerCase();
  if (reason.includes('post')) return 'postponed';
  return 'scheduled';
}

/* ------------------------------------------------------------------ match */

function normaliseMatch(rawLeague: any, m: any): Match | null {
  if (!m?.id) return null;
  const status = m.status ?? {};
  const state = mapState(status);

  const kickoff = Date.parse(status?.utcTime ?? '') || num(m.timeTS) || 0;
  const clockSeconds = parseClockSeconds(status?.liveTime?.long);
  // Fall back to the short form only when it actually contains digits —
  // otherwise "HT" strips to an empty string and reads as minute zero.
  const shortDigits = String(status?.liveTime?.short ?? '').replace(/\D/g, '');
  const minute =
    state === 'live'
      ? clockSeconds !== null
        ? Math.floor(clockSeconds / 60)
        : shortDigits === '' ? null : int(shortDigits)
      : null;

  return {
    id: `fotmob:${m.id}`,
    league: leagueOf(rawLeague),
    kickoff,
    state,
    minute,
    minuteAsOf: minute === null ? null : Date.now(),
    clockSeconds,
    clockAsOf: clockSeconds === null ? null : Date.now(),
    clockRunning: state === 'live',
    addedTime: int(status?.liveTime?.addedTime),
    statusLabel:
      state === 'finished' ? 'FT'
      : state === 'halftime' ? 'HT'
      : state === 'live'
        ? (minute !== null ? `${minute}'` : 'LIVE')
        : '',
    home: teamOf(m.home),
    away: teamOf(m.away),
    score: {
      home: state === 'scheduled' ? null : int(m.home?.score),
      away: state === 'scheduled' ? null : int(m.away?.score),
    },
    halftimeScore: null,
    venue: null,
    odds: null,
    updatedAt: Date.now(),
    source: 'fotmob',
  };
}

/* ----------------------------------------------------------------- lineup */

function normaliseLineup(team: any): TeamLineup {
  const starters: any[] = Array.isArray(team?.starters) ? team.starters.flat() : [];
  const subs: any[] = Array.isArray(team?.subs) ? team.subs.flat() : [];

  const toPlayer = (p: any, starter: boolean): LineupPlayer => {
    const perf = p?.performance ?? {};
    // `verticalLayout` is already normalised 0..1 with y measured from the
    // team's own goal, which is exactly the schema's convention — no deriving
    // positions from formation strings.
    const layout = starter ? p?.verticalLayout : null;
    const first = str(p?.firstName);
    const last = str(p?.lastName);
    const full = str(p?.name) ?? ([first, last].filter(Boolean).join(' ') || 'Unknown');
    return {
      id: `fotmob:${p?.id ?? full}`,
      name: full,
      shortName: first && last ? `${first[0]}. ${last}` : full,
      number: int(p?.shirtNumber),
      position: str(p?.positionStringShort) ?? str(p?.role),
      starter,
      x: num(layout?.x),
      y: num(layout?.y),
      rating: num(perf?.rating),
      motm: perf?.isMotm === true,
      goals: int(perf?.goals) ?? 0,
      assists: int(perf?.assists) ?? 0,
      yellow: (int(perf?.yellowCards) ?? 0) > 0,
      red: (int(perf?.redCards) ?? 0) > 0,
      subbedOff: p?.isSubstituteOut === true,
    };
  };

  const players = [
    ...starters.map(p => toPlayer(p, true)),
    ...subs.map(p => toPlayer(p, false)),
  ];

  return {
    formation: str(team?.formation),
    players,
    hasPitchPositions: players.some(p => p.starter && p.x !== null && p.y !== null),
    coach: str(team?.coach?.name),
    rating: num(team?.rating) || null,
  };
}

/* ------------------------------------------------------------------ stats */

function normaliseStats(statsBlock: any): TeamStat[] {
  const groups: any[] = statsBlock?.Periods?.All?.stats ?? [];
  const out: TeamStat[] = [];

  for (const g of groups) {
    const title = str(g?.title);
    for (const s of (g?.stats ?? []) as any[]) {
      const values = Array.isArray(s?.stats) ? s.stats : [];
      const h = values[0];
      const a = values[1];
      if (h === undefined && a === undefined) continue;
      if (h === null && a === null) continue;

      const hn = Number(String(h ?? '').replace('%', ''));
      const an = Number(String(a ?? '').replace('%', ''));
      let share: number | null = null;
      if (Number.isFinite(hn) && Number.isFinite(an) && hn + an > 0) {
        share = hn / (hn + an);
      }
      // 0 against 0 gets no bar at all: a half-filled track on both sides
      // reads as activity where nothing happened.

      out.push({
        key: str(s?.key) ?? str(s?.title) ?? `stat-${out.length}`,
        label: str(s?.title) ?? '',
        home: h === null || h === undefined ? '—' : String(h),
        away: a === null || a === undefined ? '—' : String(a),
        homeShare: share,
        group: title,
      });
    }
  }
  return out;
}

/* ----------------------------------------------------------------- events */

function normaliseEvents(eventsBlock: any): MatchEvent[] {
  const raw: any[] = eventsBlock?.events ?? [];
  const out: MatchEvent[] = [];

  for (const e of raw) {
    const type = String(e?.type ?? '');
    const side: MatchEvent['side'] =
      e?.isHome === true ? 'home' : e?.isHome === false ? 'away' : null;
    const minute = int(e?.time);
    const plus = int(e?.overloadTime) || null;
    const score =
      int(e?.homeScore) !== null && int(e?.awayScore) !== null
        ? { home: int(e.homeScore)!, away: int(e.awayScore)! }
        : null;

    let mapped: MatchEvent['type'] = 'other';
    let playerName = str(e?.player?.name);
    let playerOutName: string | null = null;
    let text: string | null = null;

    switch (type) {
      case 'Goal':
        mapped = e?.ownGoal ? 'own-goal' : 'goal';
        text = str(e?.goalDescription);
        break;
      case 'Card':
        mapped = e?.card === 'Red' ? 'red' : e?.card === 'YellowRed' ? 'second-yellow' : 'yellow';
        break;
      case 'Substitution': {
        mapped = 'substitution';
        // `swap` is [in, out].
        const swap: any[] = Array.isArray(e?.swap) ? e.swap : [];
        playerName = str(swap[0]?.name) ?? playerName;
        playerOutName = str(swap[1]?.name);
        break;
      }
      case 'VAR':
        mapped = 'var';
        text = str(e?.reason) ?? 'VAR review';
        break;
      case 'Half':
        mapped = 'period';
        text = str(e?.halfStrShort) === 'HT' ? 'Half Time' : str(e?.halfStrShort) ?? 'Period';
        break;
      case 'AddedTime':
        // Stoppage announcements are noise in a summary feed.
        continue;
      default:
        mapped = 'other';
    }

    if (mapped === 'other' && !playerName) continue;

    out.push({
      id: `fotmob:${e?.eventId ?? e?.reactKey ?? out.length}`,
      minute,
      plus,
      type: mapped,
      side,
      playerName,
      playerOutName,
      text,
      score: mapped === 'goal' || mapped === 'own-goal' ? score : null,
    });
  }

  return out.reverse();
}

/* ------------------------------------------------------------------- info */

function normaliseInfo(infoBox: any, lineup: any): MatchInfo {
  const stadium = infoBox?.Stadium ?? {};
  const ref = infoBox?.Referee ?? {};
  return {
    venue: str(stadium?.name),
    city: str(stadium?.city),
    country: str(stadium?.country),
    capacity: int(stadium?.capacity),
    attendance: int(infoBox?.Attendance),
    referee: str(ref?.text) ?? str(ref?.name),
    officials: [],
    homeCoach: str(lineup?.homeTeam?.coach?.name),
    awayCoach: str(lineup?.awayTeam?.coach?.name),
  };
}

/* ----------------------------------------------------------------- source */

function ymd(day: string): string {
  return day; // already YYYYMMDD
}

export const fotmob: Source = {
  name: 'fotmob',
  // Queried per day across all competitions — see fetchFotmobDay.
  supportsLeagueDay: false,

  async fetchLeagueDay(slug, day) {
    // FotMob is queried per day across all competitions, not per league, so a
    // per-league call would be one request per league for the same payload.
    // The merge layer calls `fetchDay` instead; this exists to satisfy the
    // interface and is intentionally a no-op.
    void slug; void day;
    return null;
  },

  async fetchDetail(_slug, matchId) {
    const id = matchId.replace(/^fotmob:/, '');
    const res = await getJson<any>(`${BASE}/matchDetails?matchId=${id}`, {
      conditional: false,
      browserLike: true,
    });
    if (!res.ok || !res.data) return null;
    const d = res.data;

    const general = d?.general ?? {};
    const header = d?.header ?? {};
    const teams: any[] = Array.isArray(header?.teams) ? header.teams : [];
    if (teams.length < 2) return null;

    const league = leagueOf({
      id: general?.parentLeagueId ?? general?.leagueId,
      primaryId: general?.parentLeagueId ?? general?.leagueId,
      name: general?.leagueName,
      ccode: general?.countryCode,
    });

    const status = header?.status ?? {};
    const state = mapState(status);
    const clockSeconds = state === 'live' ? parseClockSeconds(status?.liveTime?.long) : null;

    const match: Match = {
      id: `fotmob:${id}`,
      league,
      kickoff: Date.parse(status?.utcTime ?? general?.matchTimeUTCDate ?? '') || 0,
      state,
      minute: clockSeconds !== null ? Math.floor(clockSeconds / 60) : null,
      minuteAsOf: clockSeconds !== null ? Date.now() : null,
      clockSeconds,
      clockAsOf: clockSeconds === null ? null : Date.now(),
      clockRunning: state === 'live',
      addedTime: int(status?.liveTime?.addedTime),
      statusLabel: state === 'finished' ? 'FT' : state === 'halftime' ? 'HT' : '',
      home: { ...teamOf({ id: teams[0]?.id, name: teams[0]?.name }), crest: str(teams[0]?.imageUrl) },
      away: { ...teamOf({ id: teams[1]?.id, name: teams[1]?.name }), crest: str(teams[1]?.imageUrl) },
      score: {
        home: state === 'scheduled' ? null : int(teams[0]?.score),
        away: state === 'scheduled' ? null : int(teams[1]?.score),
      },
      halftimeScore: null,
      venue: str(d?.content?.matchFacts?.infoBox?.Stadium?.name),
      odds: null,
      updatedAt: Date.now(),
      source: 'fotmob',
    };

    const content = d?.content ?? {};
    const events = normaliseEvents(content?.matchFacts?.events);
    const stats = normaliseStats(content?.stats);

    const lu = content?.lineup;
    let lineups: MatchDetail['lineups'] = null;
    if (lu?.homeTeam && lu?.awayTeam) {
      const home = normaliseLineup(lu.homeTeam);
      const away = normaliseLineup(lu.awayTeam);
      if (home.players.length || away.players.length) lineups = { home, away };
    }

    const info = normaliseInfo(content?.matchFacts?.infoBox, lu);

    const h2hRaw: any[] = content?.h2h?.matches ?? [];
    const headToHead: Match[] = h2hRaw
      .filter(h => h?.status?.finished)
      .map(h => {
        const kickoff = Date.parse(h?.status?.utcTime ?? '') || 0;
        return {
          id: `fotmob:${String(h?.matchUrl ?? '').split('#')[1] ?? kickoff}`,
          league,
          kickoff,
          state: 'finished' as MatchState,
          minute: null, minuteAsOf: null,
          clockSeconds: null, clockAsOf: null, clockRunning: false, addedTime: null,
          statusLabel: 'FT',
          home: teamOf(h?.home),
          away: teamOf(h?.away),
          score: { home: int(h?.home?.score), away: int(h?.away?.score) },
          halftimeScore: null, venue: null, odds: null,
          updatedAt: Date.now(), source: 'fotmob',
        };
      })
      .sort((a, b) => b.kickoff - a.kickoff)
      .slice(0, 10);

    return {
      match,
      info,
      events,
      stats,
      lineups,
      standings: null,
      headToHead,
      available: {
        summary: events.length > 0,
        statistics: stats.length > 0,
        lineup: lineups !== null,
        standings: false,
        headToHead: headToHead.length > 0,
        info: info.venue !== null || info.referee !== null || info.homeCoach !== null,
      },
    };
  },

  async fetchStandings(slug) {
    // Callers work in canonical slugs, which for mapped leagues are ESPN's.
    // Translate back before asking FotMob about them.
    const key = fotmobKeyFor(slug);
    if (!key) return null;
    const id = key.replace(/^fotmob:/, '');
    const res = await getJson<any>(`${BASE}/leagues?id=${id}&tab=table`, {
      conditional: false,
      browserLike: true,
    });
    if (!res.ok || !res.data) return null;

    const tables: any[] =
      res.data?.table?.[0]?.data?.tables ?? (res.data?.table?.[0]?.data ? [res.data.table[0].data] : []);
    const rows: any[] = tables[0]?.table?.all ?? res.data?.table?.[0]?.data?.table?.all ?? [];
    if (!rows.length) return null;

    return {
      leagueSlug: slug,
      groupName: str(tables[0]?.leagueName),
      rows: rows.map((r, i): StandingRow => ({
        rank: int(r?.idx) ?? i + 1,
        team: {
          id: `fotmob:${r?.id}`,
          name: str(r?.name) ?? 'Unknown',
          shortName: str(r?.shortName) ?? '???',
          crest: r?.id
            ? `https://images.fotmob.com/image_resources/logo/teamlogo/${r.id}_small.png`
            : null,
        },
        played: int(r?.played) ?? 0,
        wins: int(r?.wins) ?? 0,
        draws: int(r?.draws) ?? 0,
        losses: int(r?.losses) ?? 0,
        goalDiff: int(r?.goalConDiff) ?? 0,
        points: int(r?.pts) ?? 0,
        marker: str(r?.qualColor) ? 'europe' : null,
      })),
      updatedAt: Date.now(),
    };
  },
};

/**
 * Whole-day fetch across every competition FotMob covers.
 *
 * This is the shape the upstream actually offers, and it is why FotMob is
 * cheap to poll broadly: one request returns every live match in the world,
 * where ESPN needs one per league.
 */
export async function fetchFotmobDay(
  day: string,
  opts: { fresh?: boolean } = {},
): Promise<Match[] | null> {
  /*
   * The live poll bypasses the edge cache.
   *
   * Measured against the origin: a plain request comes back `Hit from
   * cloudfront` with an `age` of up to 13s, and the match clock inside it is
   * stale by exactly that much. That was the entire gap between this app and
   * FotMob's own — not the poll cadence, which is a healthy 6s.
   *
   * Only today's live sweep does this. Fixture lists for other days are
   * perfectly cacheable and are left alone, so this adds one uncached request
   * every 6s rather than defeating their caching wholesale.
   */
  const bust = opts.fresh ? `&_=${Date.now()}` : '';
  const res = await getJson<any>(`${BASE}/matches?date=${ymd(day)}${bust}`, {
    conditional: false,
    browserLike: true,
  });
  if (!res.ok || !res.data) return null;

  const out: Match[] = [];
  for (const L of (res.data?.leagues ?? []) as any[]) {
    for (const m of (L?.matches ?? []) as any[]) {
      const match = normaliseMatch(L, m);
      if (match) out.push(match);
    }
  }
  return out;
}

export const FOTMOB_NOTE = HEADERS_NOTE;
