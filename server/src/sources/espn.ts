import type {
  Match, MatchDetail, MatchEvent, MatchState, Odds, StandingRow, Standings,
  Team, TeamLineup, LineupPlayer, TeamStat,
} from '../core/schema.js';
import type { Source } from './types.js';
import { getJson } from '../util/http.js';
import { getLeague } from '../catalog.js';
import { config } from '../config.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const CORE = 'https://site.api.espn.com/apis/v2/sports/soccer';

/* ------------------------------------------------------------------ helpers */

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

function mapState(type: any): MatchState {
  const name = String(type?.name ?? '');
  const state = String(type?.state ?? '');
  if (name.includes('HALFTIME')) return 'halftime';
  if (name.includes('POSTPONED')) return 'postponed';
  if (name.includes('CANCEL')) return 'cancelled';
  if (state === 'pre') return 'scheduled';
  if (state === 'in') return 'live';
  if (state === 'post') return 'finished';
  return 'unknown';
}

/** "90'" / "45+2'" / "" -> 90 / 45 / null */
function parseMinute(status: any): number | null {
  const disp = String(status?.displayClock ?? '');
  const m = disp.match(/(\d+)/);
  if (m?.[1]) return Number(m[1]);
  const clock = Number(status?.clock);
  if (Number.isFinite(clock) && clock > 0) return Math.floor(clock / 60);
  return null;
}

function team(c: any): Team {
  const t = c?.team ?? {};
  // The scoreboard exposes `logo`; the summary header exposes a `logos` array
  // instead. Check both, or crests silently vanish on the detail screen.
  const logos: any[] = Array.isArray(t.logos) ? t.logos : [];
  const fromArray =
    str(logos.find(l => l?.rel?.includes?.('default'))?.href) ?? str(logos[0]?.href);
  return {
    id: `espn:${t.id ?? c?.id ?? 'unknown'}`,
    name: str(t.displayName) ?? str(t.name) ?? 'Unknown',
    shortName: str(t.abbreviation) ?? str(t.shortDisplayName) ?? '???',
    crest: str(t.logo) ?? fromArray,
  };
}

function parseOdds(comp: any): Odds | null {
  if (!config.oddsEnabled) return null;
  const raw = Array.isArray(comp?.odds) ? comp.odds.find((o: any) => o) : null;
  if (!raw) return null;
  const home = Number(raw?.homeTeamOdds?.moneyLine ?? raw?.homeTeamOdds?.value);
  const away = Number(raw?.awayTeamOdds?.moneyLine ?? raw?.awayTeamOdds?.value);
  const draw = Number(raw?.drawOdds?.moneyLine ?? raw?.drawOdds?.value);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return {
    home,
    away,
    draw: Number.isFinite(draw) ? draw : null,
    provider: str(raw?.provider?.name),
  };
}

function normaliseMatch(slug: string, ev: any): Match | null {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const cs: any[] = Array.isArray(comp.competitors) ? comp.competitors : [];
  const homeC = cs.find(c => c?.homeAway === 'home') ?? cs[0];
  const awayC = cs.find(c => c?.homeAway === 'away') ?? cs[1];
  if (!homeC || !awayC) return null;

  const status = ev.status ?? comp.status ?? {};
  const state = mapState(status?.type);
  const kickoff = Date.parse(ev.date ?? comp.date ?? '');

  return {
    id: `espn:${ev.id}`,
    league: getLeague(slug),
    kickoff: Number.isFinite(kickoff) ? kickoff : 0,
    state,
    minute: state === 'live' ? parseMinute(status) : null,
    statusLabel: str(status?.type?.shortDetail) ?? str(status?.type?.detail) ?? '',
    home: team(homeC),
    away: team(awayC),
    score: {
      home: state === 'scheduled' ? null : int(homeC.score),
      away: state === 'scheduled' ? null : int(awayC.score),
    },
    halftimeScore: null,
    venue: str(comp?.venue?.fullName),
    odds: parseOdds(comp),
    updatedAt: Date.now(),
    source: 'espn',
  };
}

/* ---------------------------------------------------------------- lineups */

/**
 * Derive pitch coordinates from ESPN's position abbreviations.
 *
 * ESPN supplies `formationPlace`, but it is NOT a back-to-front sequential
 * index — it is the classic positional shirt convention (1 GK, 2 RB, 3 LB,
 * 5/6 centre-backs, 4/8 the two central midfielders, 7/10/11 the attacking
 * band, 9 the striker). Filling formation lines in numeric order therefore
 * puts centre-backs in midfield, which is what a first pass here did.
 *
 * `position.abbreviation` is far more trustworthy: it encodes both depth
 * ("CD", "AM", "F") and the lateral hint ("CD-L", "AM-R", "RB"). Rows are
 * built from the positions actually present, so a back three and a back four
 * both lay out correctly without special-casing the formation string.
 *
 * x: 0 = left touchline, 1 = right touchline (from the team's own view).
 * y: 0 = own goal, 1 = opposition goal.
 */

/** Depth band, 0 (keeper) to 4 (furthest forward). */
function depthOf(pos: string): number {
  const p = pos.toUpperCase();
  if (p === 'G' || p.startsWith('GK')) return 0;
  if (/^(CD|CB|RB|LB|RWB|LWB|D|SW)/.test(p)) return 1;
  if (/^(DM|CDM)/.test(p)) return 1.6;
  if (/^(M|CM|LM|RM|MF)/.test(p)) return 2;
  if (/^(AM|CAM|SS)/.test(p)) return 3;
  if (/^(F|ST|CF|LW|RW|W)/.test(p)) return 4;
  return 2;
}

/** Lateral hint: negative left, positive right, 0 central. */
function sideOf(pos: string): number {
  const p = pos.toUpperCase();
  if (p.endsWith('-R')) return 1;
  if (p.endsWith('-L')) return -1;
  if (/^(RB|RWB|RM|RW)/.test(p)) return 2;
  if (/^(LB|LWB|LM|LW)/.test(p)) return -2;
  return 0;
}

interface Placeable { position: string | null; formationPlace: number | null }

/**
 * Lay out a starting XI. Returns coordinates parallel to the input array,
 * with null for anyone we cannot place.
 */
function layoutStarters(players: Placeable[]): Array<{ x: number; y: number } | null> {
  const out: Array<{ x: number; y: number } | null> = players.map(() => null);

  const entries = players
    .map((p, i) => ({ i, pos: p.position ?? '', place: p.formationPlace ?? 99 }))
    .filter(e => e.pos !== '');
  if (entries.length === 0) return out;

  // Group by depth band.
  const rows = new Map<number, Array<{ i: number; side: number; place: number }>>();
  for (const e of entries) {
    const d = depthOf(e.pos);
    const arr = rows.get(d) ?? [];
    arr.push({ i: e.i, side: sideOf(e.pos), place: e.place });
    rows.set(d, arr);
  }

  const depths = [...rows.keys()].sort((a, b) => a - b);
  const outfield = depths.filter(d => d > 0);

  // Keeper hugs the goal; outfield rows spread across the rest of the half.
  // The top stops short of 1 so the two teams' forwards do not collide on the
  // halfway line when both halves are drawn on one pitch.
  const BOTTOM = 0.22;
  const TOP = 0.86;

  for (const d of depths) {
    const row = rows.get(d)!;
    const y = d === 0
      ? 0.06
      : outfield.length <= 1
        ? (BOTTOM + TOP) / 2
        : BOTTOM + ((TOP - BOTTOM) * outfield.indexOf(d)) / (outfield.length - 1);

    // Left to right, using the lateral hint and falling back to shirt slot.
    row.sort((a, b) => a.side - b.side || a.place - b.place);

    // Narrow rows sit centrally; only a full back four reaches the touchlines.
    const n = row.length;
    const spread = Math.min(0.76, 0.2 * n);
    row.forEach((r, k) => {
      const x = n === 1 ? 0.5 : 0.5 - spread / 2 + (spread * k) / (n - 1);
      out[r.i] = { x, y };
    });
  }

  return out;
}

function normaliseLineup(rosterEntry: any): TeamLineup {
  const formation = str(rosterEntry?.formation);
  const raw: any[] = Array.isArray(rosterEntry?.roster) ? rosterEntry.roster : [];

  const starterIdx: number[] = [];
  const placeable: Array<{ position: string | null; formationPlace: number | null }> = [];
  raw.forEach((p, i) => {
    if (!p?.starter) return;
    starterIdx.push(i);
    placeable.push({
      position: str(p?.position?.abbreviation) ?? str(p?.position?.name),
      formationPlace: int(p?.formationPlace),
    });
  });

  const coords = layoutStarters(placeable);
  const byIndex = new Map<number, { x: number; y: number } | null>();
  starterIdx.forEach((rawIdx, k) => byIndex.set(rawIdx, coords[k] ?? null));

  let anyPositioned = false;
  const players: LineupPlayer[] = raw.map((p, i) => {
    const slot = byIndex.get(i) ?? null;
    if (slot) anyPositioned = true;

    const plays: any[] = Array.isArray(p?.plays) ? p.plays : [];
    const hasCard = (kind: string) =>
      plays.some(pl => String(pl?.type?.type ?? '').includes(kind));

    return {
      id: `espn:${p?.athlete?.id ?? i}`,
      name: str(p?.athlete?.displayName) ?? str(p?.athlete?.fullName) ?? 'Unknown',
      shortName: str(p?.athlete?.shortName) ?? str(p?.athlete?.displayName) ?? 'Unknown',
      number: int(p?.jersey),
      position: str(p?.position?.abbreviation) ?? str(p?.position?.displayName),
      starter: Boolean(p?.starter),
      x: slot ? slot.x : null,
      y: slot ? slot.y : null,
      yellow: hasCard('yellow'),
      red: hasCard('red'),
      subbedOff: Boolean(p?.subbedOut),
    };
  });

  return { formation, players, hasPitchPositions: anyPositioned };
}

/* ------------------------------------------------------------------ stats */

/**
 * Ordered to match the Statistics tab in the design, not ESPN's own order.
 *
 * ESPN is inconsistent about percentages: `possessionPct` is 0-100 ("37.1")
 * while `passPct` is a 0-1 fraction rounded to one decimal ("0.7"), which
 * throws away the precision entirely. Anything ratio-like is therefore
 * computed from the raw counts rather than trusted.
 */
interface StatDef {
  key: string;
  label: string;
  /** Direct ESPN stat name, used when there is nothing to derive. */
  espn?: string;
  /** [numerator, denominator] — rendered as a percentage. */
  ratio?: [string, string];
  /** Value already arrives as 0-100 and should be suffixed with %. */
  pct?: boolean;
}

const STAT_MAP: StatDef[] = [
  { key: 'possession',   espn: 'possessionPct',  label: 'Ball Possession', pct: true },
  { key: 'shots',        espn: 'totalShots',     label: 'Shots' },
  { key: 'shotsOnGoal',  espn: 'shotsOnTarget',  label: 'Shots on Goal' },
  { key: 'passes',       espn: 'totalPasses',    label: 'Pass' },
  { key: 'passAccuracy', label: 'Pass Accuracy', ratio: ['accuratePasses', 'totalPasses'] },
  { key: 'fouls',        espn: 'foulsCommitted', label: 'Foul' },
  { key: 'yellow',       espn: 'yellowCards',    label: 'Yellow Card' },
  { key: 'red',          espn: 'redCards',       label: 'Red Card' },
  { key: 'offsides',     espn: 'offsides',       label: 'Offside' },
  { key: 'corners',      espn: 'wonCorners',     label: 'Corner' },
];

function normaliseStats(boxscore: any): TeamStat[] {
  const teams: any[] = Array.isArray(boxscore?.teams) ? boxscore.teams : [];
  if (teams.length < 2) return [];

  const pick = (side: 'home' | 'away') =>
    teams.find(t => t?.homeAway === side) ?? (side === 'home' ? teams[0] : teams[1]);

  const index = (t: any) => {
    const m = new Map<string, string>();
    for (const s of (t?.statistics ?? []) as any[]) {
      if (s?.name) m.set(String(s.name), String(s.displayValue ?? ''));
    }
    return m;
  };

  const h = index(pick('home'));
  const a = index(pick('away'));

  /** Resolve one side of one stat to a number, or null when unavailable. */
  const resolve = (m: Map<string, string>, def: StatDef): number | null => {
    if (def.ratio) {
      const num = Number(m.get(def.ratio[0]));
      const den = Number(m.get(def.ratio[1]));
      if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
      return Math.round((num / den) * 100);
    }
    const raw = m.get(def.espn ?? '');
    if (raw === undefined) return null;
    const n = Number(String(raw).replace('%', ''));
    return Number.isFinite(n) ? n : null;
  };

  const out: TeamStat[] = [];
  for (const def of STAT_MAP) {
    const hn = resolve(h, def);
    const an = resolve(a, def);
    if (hn === null && an === null) continue;

    const isPct = Boolean(def.pct || def.ratio);
    const fmt = (n: number | null) =>
      n === null ? '—' : isPct ? `${Math.round(n)}%` : String(n);

    let share: number | null = null;
    if (hn !== null && an !== null) {
      if (isPct) share = Math.min(1, Math.max(0, hn / 100));
      else if (hn + an > 0) share = hn / (hn + an);
      else share = 0.5;
    }

    out.push({ key: def.key, label: def.label, home: fmt(hn), away: fmt(an), homeShare: share });
  }
  return out;
}

/* ----------------------------------------------------------------- events */

const EVENT_TYPE: Record<string, MatchEvent['type']> = {
  'goal': 'goal',
  'own-goal': 'own-goal',
  'penalty---scored': 'penalty',
  'penalty---missed': 'penalty-missed',
  'penalty-shootout---scored': 'penalty',
  'yellow-card': 'yellow',
  'red-card': 'red',
  'second-yellow-card': 'second-yellow',
  'substitution': 'substitution',
  'kickoff': 'period',
  'halftime': 'period',
  'start-2nd-half': 'period',
  'end-regular-time': 'period',
  'full-time': 'period',
};

function normaliseEvents(keyEvents: any[], homeTeamId: string, awayTeamId: string): MatchEvent[] {
  const running = { home: 0, away: 0 };
  const out: MatchEvent[] = [];

  for (const e of keyEvents) {
    const rawType = String(e?.type?.type ?? '');
    const type = EVENT_TYPE[rawType] ?? 'other';
    const teamId = String(e?.team?.id ?? '');
    const side: MatchEvent['side'] =
      teamId && teamId === homeTeamId ? 'home'
      : teamId && teamId === awayTeamId ? 'away'
      : null;

    const display = String(e?.clock?.displayValue ?? '');
    const mm = display.match(/^(\d+)(?:\+(\d+))?/);

    const isGoal = Boolean(e?.scoringPlay) || type === 'goal' || type === 'penalty' || type === 'own-goal';
    if (isGoal && side) {
      // Derive the post-event score by tallying, rather than parsing prose.
      // Own goals credit the opposing side.
      const credited = type === 'own-goal' ? (side === 'home' ? 'away' : 'home') : side;
      running[credited] += 1;
    }

    const participants: any[] = Array.isArray(e?.participants) ? e.participants : [];

    out.push({
      id: `espn:${e?.id ?? out.length}`,
      minute: mm?.[1] ? Number(mm[1]) : null,
      plus: mm?.[2] ? Number(mm[2]) : null,
      type,
      side,
      playerName: str(participants[0]?.athlete?.displayName),
      playerOutName: type === 'substitution' ? str(participants[1]?.athlete?.displayName) : null,
      text: str(e?.text),
      score: isGoal ? { home: running.home, away: running.away } : null,
    });
  }

  // Newest first — the design shows the latest minute at the top.
  return out.reverse();
}

/* -------------------------------------------------------------- standings */

function statOf(entry: any, names: string[]): number {
  const stats: any[] = Array.isArray(entry?.stats) ? entry.stats : [];
  for (const n of names) {
    const s = stats.find(x => String(x?.name).toLowerCase() === n.toLowerCase()
      || String(x?.type).toLowerCase() === n.toLowerCase());
    if (s) {
      const v = Number(s.value ?? s.displayValue);
      if (Number.isFinite(v)) return v;
    }
  }
  return 0;
}

function normaliseStandingRows(entries: any[]): StandingRow[] {
  return entries.map((e, i) => {
    const t = e?.team;
    const teamObj: Team = typeof t === 'string'
      ? { id: `espn:${e?.id ?? i}`, name: t, shortName: t.slice(0, 3).toUpperCase(), crest: e?.logo ?? null }
      : {
          id: `espn:${t?.id ?? e?.id ?? i}`,
          name: str(t?.displayName) ?? str(t?.name) ?? String(t ?? 'Unknown'),
          shortName: str(t?.abbreviation) ?? '???',
          crest: str(t?.logos?.[0]?.href) ?? str(t?.logo),
        };

    const rank = statOf(e, ['rank']) || i + 1;
    return {
      rank,
      team: teamObj,
      played: statOf(e, ['gamesPlayed']),
      wins: statOf(e, ['wins']),
      draws: statOf(e, ['ties', 'draws']),
      losses: statOf(e, ['losses']),
      goalDiff: statOf(e, ['pointDifferential', 'pointdifferential']),
      points: statOf(e, ['points']),
      marker: null,
    };
  }).sort((a, b) => a.rank - b.rank);
}

/* ------------------------------------------------------------------ source */

export const espn: Source = {
  name: 'espn',

  /**
   * The `dates` parameter is mandatory, not optional. A bare scoreboard call
   * falls back to the nearest fixture when a league is out of season, which
   * silently renders a March match as if it were today.
   */
  async fetchLeagueDay(slug, yyyymmdd) {
    const url = `${SITE}/${slug}/scoreboard?dates=${yyyymmdd}`;
    const res = await getJson<any>(url);
    if (!res.ok) return null;
    if (res.notModified) return [];          // caller keeps its copy
    const events: any[] = Array.isArray(res.data?.events) ? res.data.events : [];

    const out: Match[] = [];
    for (const ev of events) {
      const m = normaliseMatch(slug, ev);
      // Guard against the stale-fallback case: drop anything not on the day
      // we asked for.
      if (!m) continue;
      const d = new Date(m.kickoff);
      const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
      const prev = new Date(m.kickoff - 12 * 3600_000);
      const keyPrev = `${prev.getUTCFullYear()}${String(prev.getUTCMonth() + 1).padStart(2, '0')}${String(prev.getUTCDate()).padStart(2, '0')}`;
      if (key !== yyyymmdd && keyPrev !== yyyymmdd) continue;
      out.push(m);
    }
    return out;
  },

  async fetchDetail(slug, matchId) {
    const id = matchId.replace(/^espn:/, '');
    const res = await getJson<any>(`${SITE}/${slug}/summary?event=${id}`, { conditional: false });
    if (!res.ok || !res.data) return null;
    const s = res.data;

    const header = s?.header;
    const comp = header?.competitions?.[0];
    if (!comp) return null;

    const match = normaliseMatch(slug, {
      id,
      date: comp.date,
      status: comp.status,
      competitions: [comp],
    });
    if (!match) return null;

    const homeRawId = String(comp.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id ?? '');
    const awayRawId = String(comp.competitors?.find((c: any) => c.homeAway === 'away')?.team?.id ?? '');

    const keyEvents: any[] = Array.isArray(s?.keyEvents) ? s.keyEvents : [];
    const events = normaliseEvents(keyEvents, homeRawId, awayRawId);
    const stats = normaliseStats(s?.boxscore);

    const rosters: any[] = Array.isArray(s?.rosters) ? s.rosters : [];
    let lineups: MatchDetail['lineups'] = null;
    if (rosters.length >= 2) {
      const h = rosters.find(r => r?.homeAway === 'home') ?? rosters[0];
      const a = rosters.find(r => r?.homeAway === 'away') ?? rosters[1];
      const hl = normaliseLineup(h);
      const al = normaliseLineup(a);
      if (hl.players.length || al.players.length) lineups = { home: hl, away: al };
    }

    const entries: any[] = s?.standings?.groups?.[0]?.standings?.entries ?? [];
    const standings: Standings | null = entries.length
      ? {
          leagueSlug: slug,
          groupName: str(s?.standings?.groups?.[0]?.header),
          rows: normaliseStandingRows(entries),
          updatedAt: Date.now(),
        }
      : null;

    const series: any[] = Array.isArray(s?.seasonseries?.[0]?.events) ? s.seasonseries[0].events : [];
    const headToHead: Match[] = series
      .map((e: any) => normaliseMatch(slug, e))
      .filter((m): m is Match => m !== null);

    return {
      match,
      events,
      stats,
      lineups,
      standings,
      headToHead,
      available: {
        summary: events.length > 0,
        statistics: stats.length > 0,
        lineup: lineups !== null,
        standings: standings !== null,
      },
    };
  },

  async fetchStandings(slug) {
    const res = await getJson<any>(`${CORE}/${slug}/standings`);
    if (!res.ok || !res.data) return null;
    const children: any[] = Array.isArray(res.data?.children) ? res.data.children : [];
    const entries: any[] =
      children[0]?.standings?.entries ?? res.data?.standings?.entries ?? [];
    if (!entries.length) return null;
    return {
      leagueSlug: slug,
      groupName: str(children[0]?.name) ?? str(res.data?.name),
      rows: normaliseStandingRows(entries),
      updatedAt: Date.now(),
    };
  },
};
