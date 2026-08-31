import { useEffect, useState } from 'react';
import type { Match } from '../api/types';

/**
 * The displayed match minute, interpolated forward from the last observation.
 *
 * Upstream publishes the clock in whole-minute steps that only change about
 * once a minute — measured directly: `75'` sat unchanged for 49 seconds. So a
 * minute we receive is, on average, already ~30s old, and the app shows a
 * value up to a minute behind a scout-fed service like Flashscore however fast
 * the server polls.
 *
 * The fix is display-side. Once a value has been held for 45s it is more
 * likely than not that the true minute has advanced, so tick once — and never
 * more than once, so a genuine stall (VAR, an injury break) cannot run away.
 * Any server update snaps straight back to the authoritative value.
 */
export function displayMinute(match: Pick<Match, 'minute' | 'minuteAsOf'>, now: number): number | null {
  if (match.minute === null) return null;
  if (match.minuteAsOf === null) return match.minute;
  const heldMs = now - match.minuteAsOf;
  return heldMs >= 45_000 ? match.minute + 1 : match.minute;
}

/** Re-renders once a second so interpolated clocks advance on their own. */
export function useNowTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}
