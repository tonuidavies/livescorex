import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { Delta, Match, MatchDetail, Standings } from './schema.js';
import { diffMatch } from './diff.js';
import { mergeMatches } from './merge.js';
import { config } from '../config.js';

export interface LeagueDayState {
  matches: Match[];
  /** last time a source successfully confirmed this slate */
  fetchedAt: number;
  /** whether the most recent attempt failed (serving last-known-good) */
  stale: boolean;
}

interface Snapshot {
  /**
   * Bumped whenever the Match shape changes. A snapshot written by an older
   * build lacks fields the current code reads, and `undefined` flows straight
   * through a `!== null` guard into NaN arithmetic — so an incompatible
   * snapshot is discarded rather than half-loaded.
   */
  version: 2;
  savedAt: number;
  days: Record<string, Record<string, LeagueDayState>>;
  standings: Record<string, Standings>;
}

/**
 * In-memory store with a periodic JSON snapshot.
 *
 * There is deliberately no database yet: every byte here is re-derivable from
 * upstream within one sweep, and the only user-owned data in MVP (favourites,
 * theme) lives on-device. The snapshot exists purely so a restart during a
 * match window serves last-known-good instead of a blank screen. When accounts
 * and cross-device sync land, that is the point to introduce Postgres — for
 * users and subscriptions, not for fixtures.
 */
export class Store {
  /** dayKey -> leagueSlug -> state */
  private days = new Map<string, Map<string, LeagueDayState>>();
  private byId = new Map<string, Match>();
  private standings = new Map<string, Standings>();
  private details = new Map<string, { detail: MatchDetail; at: number }>();

  private seq = 0;
  private listeners = new Set<(deltas: Delta[], seq: number, day: string) => void>();

  constructor() {
    this.load();
    setInterval(() => this.save(), config.snapshotIntervalMs).unref();
  }

  /* --------------------------------------------------------------- reads */

  getDay(dayKey: string): LeagueDayState[] {
    const day = this.days.get(dayKey);
    return day ? [...day.values()] : [];
  }

  getLeagueDay(dayKey: string, slug: string): LeagueDayState | undefined {
    return this.days.get(dayKey)?.get(slug);
  }

  getMatch(id: string): Match | undefined {
    return this.byId.get(id);
  }

  /** Every match currently in progress, across all leagues and days. */
  liveMatches(): Match[] {
    const out: Match[] = [];
    for (const m of this.byId.values()) {
      if (m.state === 'live' || m.state === 'halftime') out.push(m);
    }
    return out;
  }

  allMatches(): Match[] {
    return [...this.byId.values()];
  }

  getStandings(slug: string): Standings | undefined {
    return this.standings.get(slug);
  }

  setStandings(slug: string, s: Standings): void {
    this.standings.set(slug, s);
  }

  getDetail(id: string, maxAgeMs: number): MatchDetail | undefined {
    const hit = this.details.get(id);
    if (!hit) return undefined;
    return Date.now() - hit.at <= maxAgeMs ? hit.detail : undefined;
  }

  setDetail(id: string, detail: MatchDetail): void {
    this.details.set(id, { detail, at: Date.now() });
  }

  /* -------------------------------------------------------------- writes */

  /**
   * Replace one league's slate for one day and broadcast what changed.
   *
   * `sourceName` scopes the write: each source owns its own view of a
   * league-day, and the merged view is computed from all of them. Without that
   * scoping the two sources would overwrite each other every poll cycle and
   * the slate would flap between them.
   */
  applyLeagueDay(dayKey: string, slug: string, matches: Match[], sourceName = 'espn'): Delta[] {
    const bySource = this.sourceDays.get(dayKey) ?? new Map<string, Map<string, Match[]>>();
    const forSource = bySource.get(sourceName) ?? new Map<string, Match[]>();
    forSource.set(slug, matches);
    bySource.set(sourceName, forSource);
    this.sourceDays.set(dayKey, bySource);

    const merged = this.mergeLeagueDay(dayKey, slug);
    return this.commitLeagueDay(dayKey, slug, merged);
  }

  /** Per-source raw slates: dayKey -> source -> leagueSlug -> matches. */
  private sourceDays = new Map<string, Map<string, Map<string, Match[]>>>();

  private mergeLeagueDay(dayKey: string, slug: string): Match[] {
    const bySource = this.sourceDays.get(dayKey);
    if (!bySource) return [];
    const lists: Match[][] = [];
    for (const forSource of bySource.values()) {
      const list = forSource.get(slug);
      if (list?.length) lists.push(list);
    }
    if (lists.length === 0) return [];
    if (lists.length === 1) return lists[0]!;

    const { matches, aliases } = mergeMatches(lists);
    for (const [canonical, ids] of aliases) {
      for (const id of ids) if (id !== canonical) this.alias.set(id, canonical);
    }
    return matches;
  }

  /** Source-native id -> canonical id, so a stale link still resolves. */
  private alias = new Map<string, string>();

  resolveId(id: string): string {
    return this.alias.get(id) ?? id;
  }

  private commitLeagueDay(dayKey: string, slug: string, matches: Match[]): Delta[] {
    let day = this.days.get(dayKey);
    if (!day) { day = new Map(); this.days.set(dayKey, day); }

    const prevState = day.get(slug);
    const prevById = new Map((prevState?.matches ?? []).map(m => [m.id, m]));

    const deltas: Delta[] = [];
    for (const m of matches) {
      deltas.push(...diffMatch(prevById.get(m.id), m));
      this.byId.set(m.id, m);
      prevById.delete(m.id);
    }
    // Anything that vanished from the slate was postponed or moved.
    for (const gone of prevById.values()) {
      deltas.push({ t: 'gone', id: gone.id });
      this.byId.delete(gone.id);
    }

    day.set(slug, { matches, fetchedAt: Date.now(), stale: false });
    if (deltas.length) this.broadcast(deltas, dayKey);
    return deltas;
  }

  /** Which league-days a source currently holds, for targeted re-merges. */
  sourceSlugs(dayKey: string, sourceName: string): string[] {
    return [...(this.sourceDays.get(dayKey)?.get(sourceName)?.keys() ?? [])];
  }

  /**
   * One source's own previous view of a league-day.
   *
   * Distinct from `getLeagueDay`, which returns the merged slate. Sanity
   * checks must compare like with like: judging ESPN's payload against a
   * merged slate containing FotMob's fixtures marks ESPN as broken every time
   * the other source covers a match it does not.
   */
  getSourceLeagueDay(dayKey: string, slug: string, sourceName: string): Match[] | undefined {
    return this.sourceDays.get(dayKey)?.get(sourceName)?.get(slug);
  }

  /**
   * Mark a slate stale without discarding it. This is what keeps the app from
   * going blank when every source for a league is failing: the last good slate
   * stays queryable and the client renders it behind a staleness badge.
   */
  markStale(dayKey: string, slug: string): void {
    const s = this.days.get(dayKey)?.get(slug);
    if (s) s.stale = true;
  }

  /* ---------------------------------------------------------- broadcast */

  subscribe(fn: (deltas: Delta[], seq: number, day: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private broadcast(deltas: Delta[], day: string): void {
    this.seq += 1;
    for (const fn of this.listeners) {
      try { fn(deltas, this.seq, day); } catch { /* a bad subscriber must not stop the rest */ }
    }
  }

  currentSeq(): number { return this.seq; }

  /* ---------------------------------------------------------- snapshot */

  private load(): void {
    try {
      const snap = JSON.parse(readFileSync(config.snapshotPath, 'utf8')) as Snapshot;
      if (snap.version !== 2) {
        console.log('[store] snapshot version mismatch — starting fresh');
        return;
      }
      for (const [dayKey, leagues] of Object.entries(snap.days ?? {})) {
        const day = new Map<string, LeagueDayState>();
        for (const [slug, state] of Object.entries(leagues)) {
          // Anything restored from disk is by definition unconfirmed, and a
          // match cannot still be in play hours after kick-off — a restored
          // "live" record from yesterday would otherwise sit on the Live tab
          // forever with a running clock.
          const matches = state.matches.map(m => reconcileRestored(m));
          day.set(slug, { ...state, matches, stale: true });
          for (const m of matches) this.byId.set(m.id, m);
        }
        this.days.set(dayKey, day);
      }
      for (const [slug, s] of Object.entries(snap.standings ?? {})) {
        this.standings.set(slug, s);
      }
      console.log(`[store] restored ${this.byId.size} matches from snapshot`);
    } catch {
      // No snapshot yet, or it is unreadable. Starting empty is correct.
    }
  }

  save(): void {
    const days: Snapshot['days'] = {};
    // Only keep a rolling window; older days are re-fetchable and just bloat.
    const cutoff = Date.now() - 3 * 86_400_000;
    for (const [dayKey, leagues] of this.days) {
      const obj: Record<string, LeagueDayState> = {};
      let keep = false;
      for (const [slug, state] of leagues) {
        if (state.fetchedAt >= cutoff) { obj[slug] = state; keep = true; }
      }
      if (keep) days[dayKey] = obj;
    }
    const snap: Snapshot = {
      version: 2,
      savedAt: Date.now(),
      days,
      standings: Object.fromEntries(this.standings),
    };
    try {
      const tmp = `${config.snapshotPath}.tmp`;
      writeFileSync(tmp, JSON.stringify(snap));
      renameSync(tmp, config.snapshotPath);   // atomic, never a half-written file
    } catch (e) {
      console.warn('[store] snapshot failed', e);
    }
  }
}

/** Longest plausible match, including extra time and a generous delay. */
const MAX_MATCH_MS = 4 * 3600_000;

function reconcileRestored(m: Match): Match {
  const inPlay = m.state === 'live' || m.state === 'halftime';
  if (!inPlay || Date.now() - m.kickoff < MAX_MATCH_MS) return m;
  return {
    ...m,
    state: 'finished',
    statusLabel: 'FT',
    minute: null,
    minuteAsOf: null,
    clockSeconds: null,
    clockAsOf: null,
    clockRunning: false,
  };
}

export const store = new Store();
