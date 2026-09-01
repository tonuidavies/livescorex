import type {
  Match, MatchDetail, MatchEvent, MatchInfo, MatchState, Odds, StandingRow,
  Standings, Team, TeamLineup, LineupPlayer, TeamStat,
} from '../core/schema.js';
import type { Source } from './types.js';
import { getJson } from '../util/http.js';
import { getLeague } from '../catalog.js';
import { config } from '../config.js';

const SITE_ROOT = 'https://site.api.espn.com/apis/site/v2/sports';
const CORE_ROOT = 'https://site.api.espn.com/apis/v2/sports';

/**
 * Split a canonical league slug into its upstream path.
 *
 * Football keeps the bare slug for backwards compatibility ("eng.1"), while
 * every other sport is already namespaced by its own path
 * ("basketball/nba") — which happens to be exactly what the URL wants.
 */
function pathFor(slug: string): string {
  return slug.includes('/') ? slug : `soccer/${slug}`;
}

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

/**
 * American moneyline to decimal odds.
 *
 *   +600 -> 7.00   (600/100 + 1)
 *   -215 -> 1.47   (100/215 + 1)
 *
 * ESPN quotes American because its betting partners are US sportsbooks;
 * everywhere this app ships, decimal is what people read.
 */
function americanToDecimal(a: number): number | null {
  if (!Number.isFinite(a) || a === 0) return null;
  const dec = a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
  return Math.round(dec * 100) / 100;
}

/** "+600" / "-215" / "EVEN" -> number */
function parseAmerican(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v ?? '').trim();
  if (t === '' ) return null;
  if (/^even$/i.test(t)) return 100;
  const n = Number(t.replace('+', ''));
  return Number.isFinite(n) ? n : null;
}

function parseOdds(comp: any): Odds | null {
  if (!config.oddsEnabled) return null;
  const raw = Array.isArray(comp?.odds) ? comp.odds.find((o: any) => o) : null;
  if (!raw) return null;

  // The scoreboard often carries only `drawOdds.moneyLine` while the nested
  // `moneyline.{home,away}.close.odds` strings are populated, and the summary
  // endpoint is the reverse. Read both shapes.
  const pick = (side: 'home' | 'away' | 'draw'): number | null => {
    if (side === 'draw') {
      return parseAmerican(raw?.drawOdds?.moneyLine)
        ?? parseAmerican(raw?.moneyline?.draw?.close?.odds)
        ?? parseAmerican(raw?.moneyline?.draw?.open?.odds);
    }
    const key = side === 'home' ? 'homeTeamOdds' : 'awayTeamOdds';
    return parseAmerican(raw?.[key]?.moneyLine)
      ?? parseAmerican(raw?.moneyline?.[side]?.close?.odds)
      ?? parseAmerican(raw?.moneyline?.[side]?.open?.odds);
  };

  const home = americanToDecimal(pick('home') ?? NaN);
  const away = americanToDecimal(pick('away') ?? NaN);
  if (home === null || away === null) return null;

  const drawRaw = pick('draw');
  return {
    home,
    away,
    draw: drawRaw === null ? null : americanToDecimal(drawRaw),
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
  const minute = state === 'live' ? parseMinute(status) : null;

  return {
    id: `espn:${ev.id}`,
    league: getLeague(slug),
    kickoff: Number.isFinite(kickoff) ? kickoff : 0,
    state,
    minute,
    minuteAsOf: minute === null ? null : Date.now(),
    // ESPN publishes whole minutes only — no second-level clock to carry, so
    // the client falls back to interpolating from `minuteAsOf`.
    clockSeconds: null,
    clockAsOf: null,
    clockRunning: state === 'live',
    addedTime: null,
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
      // ESPN publishes no player rating for football.
      rating: null,
      motm: false,
      goals: 0,
      assists: 0,
      yellow: hasCard('yellow'),
      red: hasCard('red'),
      subbedOff: Boolean(p?.subbedOut),
    };
  });

  return {
    formation,
    players,
    hasPitchPositions: anyPositioned,
    // Neither the summary nor the team resource carries a coach for football.
    coach: null,
    rating: null,
  };
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
      // 0 against 0 stays null so no bar is drawn — a half-filled track on
      // both sides reads as activity where nothing happened.
    }

    out.push({
      key: def.key, label: def.label,
      home: fmt(hn), away: fmt(an),
      homeShare: share,
      group: null,   // ESPN publishes a flat list, not grouped sections
    });
  }
  return out;
}

/* ----------------------------------------------------------------- events */

/**
 * Event types.
 *
 * The feed suffixes variants onto a base kind — `goal---header`,
 * `goal---volley`, `penalty---scored` — so matching is prefix-based. An
 * exact-match table missed every headed goal, which then rendered as a
 * generic row with no ball icon.
 */
function mapEventType(raw: string): MatchEvent['type'] {
  const t = raw.toLowerCase();
  if (t.startsWith('own-goal')) return 'own-goal';
  if (t.startsWith('penalty') && t.includes('miss')) return 'penalty-missed';
  if (t.startsWith('penalty')) return 'penalty';
  if (t.startsWith('goal')) return 'goal';
  if (t.startsWith('second-yellow')) return 'second-yellow';
  if (t.startsWith('yellow')) return 'yellow';
  if (t.startsWith('red')) return 'red';
  if (t.startsWith('substitution')) return 'substitution';
  if (t.includes('var') || t.includes('review')) return 'var';
  if (['kickoff', 'halftime', 'start-2nd-half', 'end-regular-time', 'full-time',
       'start-1st-extra', 'start-2nd-extra', 'end-extra-time', 'penalty-shootout']
       .some(p => t.startsWith(p))) return 'period';
  return 'other';
}

/**
 * Timeline for the Live events tab.
 *
 * Two things worth knowing about the source:
 *
 *  - **Own goals are credited to the team that benefits**, not the team that
 *    conceded: an own goal by a Rayo player carries Barcelona's team id.
 *    Flipping it — which seems intuitive — puts the goal on the wrong side and
 *    corrupts every running score after it.
 *
 *  - **Delays are emitted twice**, once per team, and the second copy has null
 *    text and no participants. Rendered literally those become blank rows
 *    carrying nothing but a minute.
 */
function normaliseEvents(
  keyEvents: any[],
  homeTeamId: string,
  awayTeamId: string,
  finalScore: { home: number | null; away: number | null },
): MatchEvent[] {
  const running = { home: 0, away: 0 };
  const out: MatchEvent[] = [];

  for (const e of keyEvents) {
    const type = mapEventType(String(e?.type?.type ?? ''));
    const teamId = String(e?.team?.id ?? '');
    const side: MatchEvent['side'] =
      teamId && teamId === homeTeamId ? 'home'
      : teamId && teamId === awayTeamId ? 'away'
      : null;

    const participants: any[] = Array.isArray(e?.participants) ? e.participants : [];
    const text = str(e?.text);

    // Drop the noise copies: nothing to show and no period to mark.
    if (type !== 'period' && participants.length === 0 && text === null) continue;
    if (type === 'other' && participants.length === 0) continue;

    const display = String(e?.clock?.displayValue ?? '');
    const mm = display.match(/^(\d+)(?:'?\+(\d+))?/);

    // `scoringPlay` is the feed's own authoritative flag — more reliable than
    // inferring from the type string, which has many variants.
    const isGoal = e?.scoringPlay === true;
    if (isGoal && side) running[side] += 1;

    out.push({
      id: `espn:${e?.id ?? out.length}`,
      minute: mm?.[1] ? Number(mm[1]) : null,
      plus: mm?.[2] ? Number(mm[2]) : null,
      type,
      side,
      playerName: str(participants[0]?.athlete?.displayName),
      playerOutName: type === 'substitution' ? str(participants[1]?.athlete?.displayName) : null,
      text,
      score: isGoal ? { home: running.home, away: running.away } : null,
    });
  }

  // If the tally disagrees with the actual score we have missed or
  // double-counted something. Showing no running score is better than showing
  // a wrong one, so drop them rather than guess.
  const expected = finalScore.home !== null && finalScore.away !== null;
  if (expected && (running.home !== finalScore.home || running.away !== finalScore.away)) {
    console.warn(
      `[espn] event tally ${running.home}-${running.away} != score ` +
      `${finalScore.home}-${finalScore.away}; suppressing per-event scores`,
    );
    for (const ev of out) ev.score = null;
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

/* -------------------------------------------------------------------- h2h */

/**
 * Previous meetings, from `seasonseries`.
 *
 * These entries are NOT scoreboard events: they have `competitors` directly on
 * the object with no `competitions` wrapper, and `statusType` rather than
 * `status`. Feeding them to `normaliseMatch` silently produced an empty list,
 * which is why the Matches tab never appeared.
 */
function normaliseSeriesEvent(slug: string, e: any): Match | null {
  const cs: any[] = Array.isArray(e?.competitors) ? e.competitors : [];
  const homeC = cs.find(c => c?.homeAway === 'home') ?? cs[0];
  const awayC = cs.find(c => c?.homeAway === 'away') ?? cs[1];
  if (!homeC || !awayC) return null;

  const type = e?.statusType ?? e?.status?.type ?? {};
  const state = mapState(type);
  const kickoff = Date.parse(e?.date ?? '');

  return {
    id: `espn:${e?.id ?? ''}`,
    league: getLeague(slug),
    kickoff: Number.isFinite(kickoff) ? kickoff : 0,
    state,
    minute: null,
    minuteAsOf: null,
    clockSeconds: null,
    clockAsOf: null,
    clockRunning: false,
    addedTime: null,
    statusLabel: str(type?.shortDetail) ?? str(type?.detail) ?? 'FT',
    home: team(homeC),
    away: team(awayC),
    score: { home: int(homeC.score), away: int(awayC.score) },
    halftimeScore: null,
    venue: null,
    odds: null,
    updatedAt: Date.now(),
    source: 'espn',
  };
}

/* ------------------------------------------------------------------- info */

function normaliseInfo(gameInfo: any, comp: any): MatchInfo {
  const officials: any[] = Array.isArray(gameInfo?.officials) ? gameInfo.officials : [];
  const ref = officials.find(o =>
    String(o?.position?.name ?? '').toLowerCase().includes('referee'));

  const venue = gameInfo?.venue ?? comp?.venue ?? null;

  return {
    venue: str(venue?.fullName),
    city: str(venue?.address?.city),
    country: str(venue?.address?.country),
    capacity: null,
    attendance: int(gameInfo?.attendance) || null,
    referee: str(ref?.displayName) ?? str(ref?.fullName),
    homeCoach: null,
    awayCoach: null,
    officials: officials
      .filter(o => o !== ref)
      .map(o => {
        const name = str(o?.displayName) ?? str(o?.fullName);
        const role = str(o?.position?.displayName);
        return name ? (role ? `${name} (${role})` : name) : null;
      })
      .filter((x): x is string => x !== null),
  };
}

/* ------------------------------------------------------------------ source */

export const espn: Source = {
  name: 'espn',
  supportsLeagueDay: true,

  /**
   * The `dates` parameter is mandatory, not optional. A bare scoreboard call
   * falls back to the nearest fixture when a league is out of season, which
   * silently renders a March match as if it were today.
   */
  async fetchLeagueDay(slug, yyyymmdd) {
    const url = `${SITE_ROOT}/${pathFor(slug)}/scoreboard?dates=${yyyymmdd}`;
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
    const res = await getJson<any>(
      `${SITE_ROOT}/${pathFor(slug)}/summary?event=${id}`, { conditional: false });
    if (!res.ok || !res.data) return null;
    const s = res.data;

    const header = s?.header;
    const comp = header?.competitions?.[0];
    if (!comp) return null;

    const match = normaliseMatch(slug, {
      id,
      date: comp.date,
      status: comp.status,
      // The summary's own `odds` block carries both moneylines, where the
      // scoreboard often has only the draw.
      competitions: [{ ...comp, odds: s?.odds ?? comp?.odds }],
    });
    if (!match) return null;

    const homeRawId = String(comp.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id ?? '');
    const awayRawId = String(comp.competitors?.find((c: any) => c.homeAway === 'away')?.team?.id ?? '');

    const keyEvents: any[] = Array.isArray(s?.keyEvents) ? s.keyEvents : [];
    const events = normaliseEvents(keyEvents, homeRawId, awayRawId, match.score);
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
      .map((e: any) => normaliseSeriesEvent(slug, e))
      .filter((m): m is Match => m !== null)
      .sort((a, b) => b.kickoff - a.kickoff);

    const info = normaliseInfo(s?.gameInfo, comp);
    const hasInfo =
      info.venue !== null || info.referee !== null || info.attendance !== null;

    return {
      match,
      info,
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
        headToHead: headToHead.length > 0,
        info: hasInfo,
      },
    };
  },

  async fetchStandings(slug) {
    const res = await getJson<any>(`${CORE_ROOT}/${pathFor(slug)}/standings`);
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
