import type { Delta, Match } from '../core/schema.js';
import { store } from '../core/store.js';
import { devices, type Device } from '../core/devices.js';
import { FcmClient } from './fcm.js';

/**
 * Turns store deltas into push messages.
 *
 * Two rules shape everything here:
 *
 *   1. **Not every delta is worth a push.** A minute tick is not news. Goals,
 *      kickoff, half time and full time are. Everything else updates the
 *      already-visible notification silently, or not at all.
 *
 *   2. **A live notification is a single, mutating object.** The app renders
 *      data messages itself and updates one notification per match in place,
 *      so a 4-3 thriller produces one notification that changes seven times,
 *      not seven notifications.
 */

/** Which deltas are worth waking a device for. */
type Kind = 'goal' | 'kickoff' | 'halftime' | 'fulltime' | 'update';

interface Pending {
  match: Match;
  kind: Kind;
  at: number;
}

export class Notifier {
  private fcm = new FcmClient();
  private queue = new Map<string, Pending>();
  private timer: NodeJS.Timeout | null = null;

  /** Per-device-per-match throttle for silent updates. */
  private lastSilent = new Map<string, number>();

  /**
   * Minutes at which goals were scored, per match. Accumulated from score
   * deltas as they arrive rather than refetched, so it costs nothing — and it
   * is what draws the goal markers on the Android 36 progress bar.
   */
  private goalMinutes = new Map<string, number[]>();

  readonly stats = { queued: 0, sent: 0, failed: 0, pruned: 0, skipped: 0 };

  start(): void {
    store.subscribe(deltas => this.onDeltas(deltas));
    // Coalesce: a goal usually arrives as a score delta and a state delta in
    // the same tick. Batching by match collapses them into one push.
    this.timer = setInterval(() => void this.flush(), 2_000);
    this.timer.unref?.();
    console.log(`[notify] started, push ${this.fcm.enabled ? 'live' : 'dry-run'}`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private onDeltas(deltas: Delta[]): void {
    for (const d of deltas) {
      const match = store.getMatch(d.id);
      if (!match) continue;

      let kind: Kind | null = null;
      if (d.t === 'score') {
        kind = 'goal';
        if (d.minute !== null) {
          const mins = this.goalMinutes.get(d.id) ?? [];
          if (!mins.includes(d.minute)) {
            mins.push(d.minute);
            this.goalMinutes.set(d.id, mins);
          }
        }
      }
      else if (d.t === 'state') {
        if (d.state === 'live' && match.minute !== null && match.minute <= 2) kind = 'kickoff';
        else if (d.state === 'halftime') kind = 'halftime';
        else if (d.state === 'finished') kind = 'fulltime';
        else kind = 'update';
      } else if (d.t === 'minute') {
        // Minute ticks refresh the notification body but never alert. They are
        // also the highest-volume delta by far, so they are rate-limited hard
        // in `flush`.
        kind = 'update';
      }
      if (!kind) continue;

      const existing = this.queue.get(d.id);
      // A goal must not be downgraded to an update by a minute tick landing in
      // the same window.
      if (existing && rank(existing.kind) >= rank(kind)) {
        existing.match = match;
        continue;
      }
      this.queue.set(d.id, { match, kind, at: Date.now() });
      this.stats.queued += 1;
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.size === 0) return;
    const batch = [...this.queue.values()];
    this.queue.clear();

    for (const item of batch) {
      const subs = devices.subscribersFor(
        [item.match.home.id, item.match.away.id],
        item.match.league.slug,
      );
      if (subs.length === 0) continue;

      const alerting = item.kind !== 'update';

      for (const dev of subs) {
        if (!alerting && !this.allowSilent(dev.token, item.match.id)) {
          this.stats.skipped += 1;
          continue;
        }
        await this.sendTo(dev, item, alerting);
      }
    }
  }

  /**
   * Silent refreshes are capped at one per match per device per minute.
   * Without this a 90-minute match would push ~90 times per viewer for no
   * visible benefit — the notification only shows the minute, and nobody is
   * watching it tick.
   */
  private allowSilent(token: string, matchId: string): boolean {
    const key = `${token}:${matchId}`;
    const last = this.lastSilent.get(key) ?? 0;
    if (Date.now() - last < 60_000) return false;
    this.lastSilent.set(key, Date.now());
    return true;
  }

  private async sendTo(dev: Device, item: Pending, alerting: boolean): Promise<void> {
    const m = item.match;
    const res = await this.fcm.send({
      token: dev.token,
      priority: alerting ? 'high' : 'normal',
      // One slot per match: an undelivered older update is replaced, not queued.
      collapseKey: m.id,
      ttlSeconds: alerting ? 900 : 120,
      data: {
        type: 'match-update',
        kind: item.kind,
        matchId: m.id,
        leagueSlug: m.league.slug,
        leagueName: m.league.name,
        homeName: m.home.name,
        awayName: m.away.name,
        homeShort: m.home.shortName,
        awayShort: m.away.shortName,
        homeCrest: m.home.crest ?? '',
        awayCrest: m.away.crest ?? '',
        homeScore: String(m.score.home ?? 0),
        awayScore: String(m.score.away ?? 0),
        minute: m.minute === null ? '' : String(m.minute),
        goalMinutes: (this.goalMinutes.get(m.id) ?? []).join(','),
        statusLabel: m.statusLabel,
        state: m.state,
        // The app dismisses the ongoing notification on full time rather than
        // leaving a dead match pinned to the shade forever.
        ongoing: m.state === 'live' || m.state === 'halftime' ? '1' : '0',
        alert: alerting ? '1' : '0',
      },
    });

    if (res === 'ok') this.stats.sent += 1;
    else if (res === 'gone') { devices.remove(dev.token); this.stats.pruned += 1; }
    else this.stats.failed += 1;

    // Once a match is over nothing more will be sent about it; drop its
    // bookkeeping rather than leaking a map entry per fixture per season.
    if (m.state === 'finished' || m.state === 'cancelled' || m.state === 'postponed') {
      this.goalMinutes.delete(m.id);
      for (const key of this.lastSilent.keys()) {
        if (key.endsWith(`:${m.id}`)) this.lastSilent.delete(key);
      }
    }
  }

  health() {
    return { ...this.stats, pushEnabled: this.fcm.enabled, queued: this.queue.size };
  }

  /**
   * Fire a notification for a real match on demand.
   *
   * Waiting for an actual goal is a terrible development loop — you cannot
   * make Arsenal score. This drives the same code path as a live delta so what
   * you see on the device is what a real goal produces.
   */
  async simulate(matchId: string, kind: Kind = 'goal'): Promise<{ sent: number; match: string } | null> {
    const match = store.getMatch(matchId);
    if (!match) return null;

    const subs = devices.subscribersFor([match.home.id, match.away.id], match.league.slug);
    for (const dev of subs) {
      await this.sendTo(dev, { match, kind, at: Date.now() }, kind !== 'update');
    }
    return { sent: subs.length, match: `${match.home.name} v ${match.away.name}` };
  }
}

function rank(k: Kind): number {
  switch (k) {
    case 'goal': return 4;
    case 'fulltime': return 3;
    case 'halftime': return 2;
    case 'kickoff': return 2;
    default: return 1;
  }
}
