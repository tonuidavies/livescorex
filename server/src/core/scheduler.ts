import type { Match, MatchDetail } from './schema.js';
import type { Source } from '../sources/types.js';
import { CircuitBreaker } from './breaker.js';
import { store } from './store.js';
import { LEAGUES, LEAGUE_BY_SLUG } from '../catalog.js';
import { config } from '../config.js';
import { fetchFotmobDay } from '../sources/fotmob.js';

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
  /** Payloads rejected as implausibly empty — see the sanity gate. */
  suspiciousEmpty: number;
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
    pollsThisMinute: 0, deltasEmitted: 0, suspiciousEmpty: 0,
  };

  /** FotMob-specific counters, surfaced in /health. */
  readonly fotmob = { polls: 0, failures: 0, matches: 0, lastAt: 0 };
  private fotmobTimer: NodeJS.Timeout | null = null;

  constructor(private readonly sources: Source[]) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref?.();

    /**
     * FotMob returns every match in the world for a given day in a single
     * request, so polling it broadly costs one call rather than one per
     * league. That is what makes second-level clocks affordable across all
     * competitions at once — the expensive per-league polling stays reserved
     * for the leagues only ESPN carries.
     */
    if (config.fotmobEnabled) {
      this.fotmobTimer = setInterval(() => void this.pollFotmob(), config.pollFotmob * 1000);
      this.fotmobTimer.unref?.();
      void this.pollFotmob();
    }

    void this.bootstrap();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.fotmobTimer) clearInterval(this.fotmobTimer);
    this.timer = null;
    this.fotmobTimer = null;
  }

  private fotmobRunning = false;

  /** One request; every live match on the planet. */
  private async pollFotmob(days: string[] = [dayKey()]): Promise<void> {
    if (this.fotmobRunning) return;
    this.fotmobRunning = true;
    try {
      for (const day of days) {
        this.stats.requests += 1;
        this.fotmob.polls += 1;
        const matches = await fetchFotmobDay(day);
        if (!matches) { this.fotmob.failures += 1; continue; }

        this.fotmob.matches = matches.length;
        this.fotmob.lastAt = Date.now();

        // Group by canonical league so each slate lands where ESPN's does and
        // the store can merge the two.
        const bySlug = new Map<string, typeof matches>();
        for (const m of matches) {
          const arr = bySlug.get(m.league.slug) ?? [];
          arr.push(m);
          bySlug.set(m.league.slug, arr);
        }

        // A league FotMob covered a moment ago but not now has finished for
        // the day; clear it rather than leaving a frozen slate behind.
        for (const slug of store.sourceSlugs(day, 'fotmob')) {
          if (!bySlug.has(slug)) bySlug.set(slug, []);
        }

        for (const [slug, list] of bySlug) {
          const deltas = store.applyLeagueDay(day, slug, list, 'fotmob');
          this.stats.deltasEmitted += deltas.length;
        }
      }
    } catch (e) {
      this.fotmob.failures += 1;
    } finally {
      this.fotmobRunning = false;
    }
  }

  /** First run: get today on screen before worrying about the horizon. */
  private async bootstrap(): Promise<void> {
    console.log('[sched] bootstrap: sweeping today');
    await this.sweep([dayKey()]);
    console.log('[sched] bootstrap: extending horizon');
    await this.sweep(this.horizon().slice(1));
    if (config.fotmobEnabled) await this.pollFotmob(this.horizon().slice(1));
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
  private async fetchLeagueDay(slug: string, day: string, force = false): Promise<boolean> {
    for (const src of this.sources) {
      // Sources without a per-league query are driven by their own whole-day
      // path; calling them here would count an intentional no-op as a failure
      // and trip their breaker.
      if (!src.supportsLeagueDay) continue;
      // `force` is for user-initiated fetches: somebody tapping a date should
      // get a live attempt rather than an empty screen because a background
      // poll tripped the breaker a minute ago.
      if (!force && this.breaker.isOpen(src.name)) continue;
      try {
        this.stats.requests += 1;
        const matches = await src.fetchLeagueDay(slug, day);
        if (matches === null) throw new Error('source returned null');

        // Sanity gate: a source that starts answering 200-with-nothing is a
        // silent failure, and a nastier bug than an outright 403.
        //
        // Compared against this source's *own* previous slate, not the merged
        // one — otherwise every day where the other source covers a fixture
        // this one does not counts as a failure here, and three of those in a
        // row opened the breaker for five minutes, which silently emptied
        // every date the user tapped.
        const prev = store.getSourceLeagueDay(day, slug, src.name);
        if (matches.length === 0 && prev && prev.length > 0) {
          // A payload judgement, not a statement about the source's health:
          // deliberately does not count toward the breaker.
          this.stats.suspiciousEmpty += 1;
          store.markStale(day, slug);
          return false;
        }

        this.breaker.success(src.name);
        const deltas = store.applyLeagueDay(day, slug, matches, src.name);
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
      if (config.fotmobEnabled) await this.pollFotmob(this.horizon());
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
      fotmob: {
        ...this.fotmob,
        enabled: config.fotmobEnabled,
        ageMs: this.fotmob.lastAt ? Date.now() - this.fotmob.lastAt : null,
      },
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

    // Fetching every competition for an untouched day takes ~20s, which is
    // longer than anyone will wait after tapping a date. So the caller is
    // unblocked once the leagues people actually follow are in — a couple of
    // seconds — and the long tail continues in the background, reaching the
    // client as deltas.
    const byTier = (a: string, b: string) => {
      const ta = LEAGUE_BY_SLUG.get(a)?.tier ?? 2;
      const tb = LEAGUE_BY_SLUG.get(b)?.tier ?? 2;
      return ta - tb;
    };
    const ordered = [...missing].sort(byTier);
    const priority = ordered.filter(s => (LEAGUE_BY_SLUG.get(s)?.tier ?? 2) === 1);
    const tail = ordered.filter(s => (LEAGUE_BY_SLUG.get(s)?.tier ?? 2) !== 1);

    const run = async (list: string[], concurrency: number) => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < list.length) {
          const slug = list[cursor++];
          if (!slug) break;
          await this.fetchLeagueDay(slug, day, true);
          await sleep(25);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
    };

    const job = (async () => {
      await run(priority, 8);
      // Not awaited: the response goes out now and the rest streams in.
      void run(tail, 6)
        .then(() => console.log(`[sched] backfilled ${tail.length} more leagues for ${day}`))
        .catch(() => {})
        .finally(() => this.dayFetches.delete(key));
      console.log(`[sched] on-demand fetch for ${day}: ${priority.length} priority, ${tail.length} queued`);
    })();

    this.dayFetches.set(key, job);
    return job;
  }

  private async attachStandings(detail: MatchDetail, slug: string): Promise<MatchDetail> {
    const leagueSlug = detail.match.league.slug || slug;
    try {
      await this.ensureStandings(leagueSlug);
    } catch {
      return detail;
    }
    const table = store.getStandings(leagueSlug);
    if (!table) return detail;
    return {
      ...detail,
      standings: table,
      available: { ...detail.available, standings: true },
    };
  }

  /** Exposed so the REST layer can lazily fill standings on first request. */
  async ensureStandings(slug: string): Promise<void> {
    const existing = store.getStandings(slug);
    if (existing && Date.now() - existing.updatedAt < 10 * 60_000) return;
    // A `fotmob:` slug can only be answered by FotMob; an ESPN slug is tried
    // against ESPN first and FotMob second, since the mapping means many
    // leagues have a table in both.
    const prefix = slug.split(':')[0] ?? '';
    const ordered = prefix === 'fotmob'
      ? this.sources.filter(s => s.name === 'fotmob')
      : [...this.sources.filter(s => s.name !== 'fotmob'), ...this.sources.filter(s => s.name === 'fotmob')];

    for (const src of ordered) {
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

  /**
   * Detail is routed by the id's own source prefix.
   *
   * A merged match keeps the winning source's id, so `fotmob:123` must ask
   * FotMob and `espn:456` must ask ESPN — asking the wrong one returns
   * nothing at all. Other sources are then tried as a genuine fallback.
   */
  async fetchDetail(slug: string, matchId: string) {
    const id = store.resolveId(matchId);
    const cached = store.getDetail(id, 8_000);
    if (cached) return cached;

    const prefix = id.split(':')[0] ?? '';
    const ordered = [
      ...this.sources.filter(s => s.name === prefix),
      ...this.sources.filter(s => s.name !== prefix),
    ];

    for (const src of ordered) {
      if (this.breaker.isOpen(src.name)) continue;
      // Only the owning source can resolve its own id.
      if (src.name !== prefix) continue;
      try {
        this.stats.requests += 1;
        const d = await src.fetchDetail(slug, id);
        if (d) {
          // Not every source returns a table with the match payload. Fill it
          // from the standings cache so the tab exists wherever a table does,
          // rather than only for the source that happens to bundle one.
          const withTable = d.standings ? d : await this.attachStandings(d, slug);
          store.setDetail(id, withTable);
          this.breaker.success(src.name);
          return withTable;
        }
        throw new Error('no detail');
      } catch {
        this.breaker.fail(src.name);
      }
    }
    // Last-known-good, however old, beats an error screen.
    return store.getDetail(id, Number.MAX_SAFE_INTEGER) ?? null;
  }
}
