import type { Match } from './schema.js';
import type { Source } from '../sources/types.js';
import { CircuitBreaker } from './breaker.js';
import { store } from './store.js';
import { LEAGUES } from '../catalog.js';
import { config } from '../config.js';

export function dayKey(d: Date | number = Date.now()): string {
  const x = new Date(d);
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Stats {
  requests: number;
  sweeps: number;
  lastSweepAt: number | null;
  lastSweepMs: number | null;
  pollsThisMinute: number;
  deltasEmitted: number;
}

/**
 * State-aware scheduler.
 *
 * Polling all 259 competitions every 10s would be ~2.2M requests/day at 26 rps
 * and would get the egress IP blocked within the hour. Instead:
 *
 *   1. One daily sweep reads every league's fixture list. Now we know exactly
 *      which leagues have matches today and when each kicks off.
 *   2. During the day, only leagues with a match actually in progress (plus a
 *      lead-in before kickoff) are polled, at a cadence set by tier.
 *   3. Everything else costs nothing.
 *
 * On a busy Saturday that is roughly 40 concurrent leagues at 4 rps — about
 * 50k requests/day rather than 2.2M, and the saved budget goes to matches that
 * are actually live, so freshness improves as load falls.
 */
export class Scheduler {
  private breaker = new CircuitBreaker();
  private timer: NodeJS.Timeout | null = null;
  private lastSweepDay: string | null = null;
  private lastPoll = new Map<string, number>();
  private running = false;

  readonly stats: Stats = {
    requests: 0, sweeps: 0, lastSweepAt: null, lastSweepMs: null,
    pollsThisMinute: 0, deltasEmitted: 0,
  };

  constructor(private readonly sources: Source[]) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref?.();
    void this.bootstrap();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** First run: get today on screen before worrying about the horizon. */
  private async bootstrap(): Promise<void> {
    console.log('[sched] bootstrap: sweeping today');
    await this.sweep([dayKey()]);
    console.log('[sched] bootstrap: extending horizon');
    await this.sweep(this.horizon().slice(1));
    this.lastSweepDay = dayKey();
  }

  /** Today plus the next two days for everything; tier 1 gets a full week. */
  private horizon(): string[] {
    const out: string[] = [];
    for (let i = 0; i < 3; i++) out.push(dayKey(Date.now() + i * 86_400_000));
    return out;
  }

  private tier1Horizon(): string[] {
    const out: string[] = [];
    for (let i = 3; i < 7; i++) out.push(dayKey(Date.now() + i * 86_400_000));
    return out;
  }

  /**
   * Fetch a league-day through the source chain. First source that returns a
   * plausible payload wins; if all fail the previous slate is kept and marked
   * stale rather than cleared.
   */
  private async fetchLeagueDay(slug: string, day: string): Promise<boolean> {
    for (const src of this.sources) {
      if (this.breaker.isOpen(src.name)) continue;
      try {
        this.stats.requests += 1;
        const matches = await src.fetchLeagueDay(slug, day);
        if (matches === null) throw new Error('source returned null');

        // Sanity gate: a source that starts answering 200-with-nothing is a
        // silent failure, and it is a nastier bug than an outright 403. Only
        // trust an empty slate when we had nothing there before either.
        const prev = store.getLeagueDay(day, slug);
        if (matches.length === 0 && prev && prev.matches.length > 0) {
          throw new Error('suspicious empty slate');
        }

        this.breaker.success(src.name);
        const deltas = store.applyLeagueDay(day, slug, matches);
        this.stats.deltasEmitted += deltas.length;
        return true;
      } catch {
        this.breaker.fail(src.name);
      }
    }
    store.markStale(day, slug);
    return false;
  }

  /** One request per league per day, run with bounded concurrency. */
  private async sweep(days: string[]): Promise<void> {
    if (this.running) return;
    this.running = true;
    const started = Date.now();

    const jobs: Array<{ slug: string; day: string }> = [];
    for (const day of days) for (const l of LEAGUES) jobs.push({ slug: l.slug, day });

    const CONCURRENCY = 6;
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        if (!job) break;
        await this.fetchLeagueDay(job.slug, job.day);
        await sleep(40);   // ~150 rps ceiling shared across workers; stay polite
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    this.stats.sweeps += 1;
    this.stats.lastSweepAt = Date.now();
    this.stats.lastSweepMs = Date.now() - started;
    this.running = false;
    console.log(`[sched] sweep of ${jobs.length} league-days in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    store.save();
  }

  /**
   * Which leagues need attention right now: any with a match in progress, or
   * kicking off shortly, or recently finished (so full-time is not missed).
   */
  private activeLeagues(): Map<string, 1 | 2> {
    const now = Date.now();
    const active = new Map<string, 1 | 2>();
    for (const m of store.allMatches()) {
      const inWindow =
        m.state === 'live' ||
        m.state === 'halftime' ||
        (m.state === 'scheduled' && m.kickoff - now <= config.preKickoffLeadMs && m.kickoff - now > -config.postMatchGraceMs) ||
        (m.state === 'finished' && now - m.updatedAt < config.postMatchGraceMs && now - m.kickoff < 3 * 3600_000);
      if (inWindow) active.set(m.league.slug, m.league.tier);
    }
    return active;
  }

  private async tick(): Promise<void> {
    const now = new Date();

    // Daily sweep, once, at the configured hour.
    const today = dayKey(now);
    if (now.getHours() === config.sweepHour && this.lastSweepDay !== today) {
      this.lastSweepDay = today;
      await this.sweep(this.horizon());
      await this.sweep(this.tier1Horizon());
      return;
    }

    if (this.running) return;

    const active = this.activeLeagues();
    const day = today;
    const jobs: string[] = [];

    for (const [slug, tier] of active) {
      const cadence = (tier === 1 ? config.pollLiveTier1 : config.pollLiveTier2) * 1000;
      const last = this.lastPoll.get(slug) ?? 0;
      if (Date.now() - last >= cadence) jobs.push(slug);
    }
    if (!jobs.length) return;

    this.stats.pollsThisMinute = jobs.length;

    const CONCURRENCY = 6;
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const slug = jobs[cursor++];
        if (!slug) break;
        this.lastPoll.set(slug, Date.now());
        await this.fetchLeagueDay(slug, day);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  health() {
    return {
      ...this.stats,
      activeLeagues: this.activeLeagues().size,
      liveMatches: store.liveMatches().length,
      knownMatches: store.allMatches().length,
      breakers: this.breaker.status(),
      sources: this.sources.map(s => s.name),
    };
  }

  /**
   * Fetch a day the sweep has not covered, on demand.
   *
   * The date strip offers three weeks; the daily sweep covers three days (a
   * week for tier 1). Without this, scrolling to next Saturday showed an empty
   * screen — the data was never wrong, it was simply never fetched.
   *
   * In-flight requests are shared so twenty clients opening the same date
   * produce one upstream sweep, not twenty.
   */
  private dayFetches = new Map<string, Promise<void>>();

  async ensureDay(day: string, slugs?: string[]): Promise<void> {
    const wanted = slugs?.length ? slugs : LEAGUES.map(l => l.slug);
    const missing = wanted.filter(slug => !store.getLeagueDay(day, slug));
    if (missing.length === 0) return;

    const key = `${day}:${missing.length === wanted.length ? 'all' : missing.join(',')}`;
    const existing = this.dayFetches.get(key);
    if (existing) return existing;

    const job = (async () => {
      const CONCURRENCY = 6;
      let cursor = 0;
      const worker = async () => {
        while (cursor < missing.length) {
          const slug = missing[cursor++];
          if (!slug) break;
          await this.fetchLeagueDay(slug, day);
          await sleep(30);
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      console.log(`[sched] on-demand fetch of ${missing.length} leagues for ${day}`);
    })().finally(() => this.dayFetches.delete(key));

    this.dayFetches.set(key, job);
    return job;
  }

  /** Exposed so the REST layer can lazily fill standings on first request. */
  async ensureStandings(slug: string): Promise<void> {
    const existing = store.getStandings(slug);
    if (existing && Date.now() - existing.updatedAt < 10 * 60_000) return;
    for (const src of this.sources) {
      if (this.breaker.isOpen(src.name)) continue;
      try {
        this.stats.requests += 1;
        const s = await src.fetchStandings(slug);
        if (s) { store.setStandings(slug, s); this.breaker.success(src.name); return; }
        throw new Error('no standings');
      } catch {
        this.breaker.fail(src.name);
      }
    }
  }

  async fetchDetail(slug: string, matchId: string) {
    const cached = store.getDetail(matchId, 15_000);
    if (cached) return cached;
    for (const src of this.sources) {
      if (this.breaker.isOpen(src.name)) continue;
      try {
        this.stats.requests += 1;
        const d = await src.fetchDetail(slug, matchId);
        if (d) { store.setDetail(matchId, d); this.breaker.success(src.name); return d; }
        throw new Error('no detail');
      } catch {
        this.breaker.fail(src.name);
      }
    }
    // Last-known-good, however old, beats an error screen.
    return store.getDetail(matchId, Number.MAX_SAFE_INTEGER) ?? null;
  }
}
