import { useEffect, useState } from 'react';
import type { Match } from '../api/types';

/**
 * The displayed match clock.
 *
 * Two very different sources feed this:
 *
 *  - One publishes elapsed **seconds** (`"68:05"`). There the clock simply runs
 *    forward in real time from when it was observed, which is what makes the
 *    app read level with a scout-fed service rather than a minute behind one.
 *
 *  - The other publishes whole **minutes**, changing only about once a minute —
 *    measured directly: `75'` sat unchanged for 49 seconds. A value from that
 *    source is ~30s stale on arrival and no polling rate fixes it, so once it
 *    has been held 45s we tick once and never more, and snap back on the next
 *    update.
 */

export interface DisplayClock {
  /** Minute shown to the user, already stoppage-adjusted by the source. */
  minute: number | null;
  /** Seconds within the minute; null when the source has no second precision. */
  seconds: number | null;
  /** `"68:05"` when seconds are known, otherwise `"68'"`. */
  label: string;
  precise: boolean;
}

export function matchClock(m: Match, now: number): DisplayClock | null {
  // `!= null` deliberately, not `!== null`: a record persisted by an older
  // build has these fields absent rather than null, and `undefined` sails
  // through a strict check straight into NaN arithmetic.
  if (m.clockSeconds != null && m.clockAsOf != null) {
    const elapsed = m.clockRunning ? Math.max(0, now - m.clockAsOf) : 0;
    const total = m.clockSeconds + Math.floor(elapsed / 1000);
    const minute = Math.floor(total / 60);
    const seconds = total % 60;
    if (!Number.isFinite(minute)) return null;
    return {
      minute,
      seconds,
      label: `${minute}:${String(seconds).padStart(2, '0')}`,
      precise: true,
    };
  }

  if (m.minute == null || !Number.isFinite(m.minute)) return null;
  const held = m.minuteAsOf == null ? 0 : now - m.minuteAsOf;
  const minute = held >= 45_000 ? m.minute + 1 : m.minute;
  return { minute, seconds: null, label: `${minute}'`, precise: false };
}

/** Kept for callers that only need the minute. */
export function displayMinute(m: Match, now: number): number | null {
  return matchClock(m, now)?.minute ?? null;
}

/**
 * Re-renders on an interval so clocks advance on their own.
 *
 * A precise clock needs a second; a minute-only clock does not, so lists
 * without any second-level source can tick far more slowly and save the
 * renders.
 */
export function useNowTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}
