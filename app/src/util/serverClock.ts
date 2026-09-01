/**
 * Server-relative time.
 *
 * Match clocks are anchored with a timestamp taken on the server
 * (`clockAsOf`), but interpolated forward using the device's clock. Mixing the
 * two is only correct while the two clocks agree — and a phone whose clock is
 * off by eight seconds would display a match running eight seconds late, with
 * nothing in the pipeline to blame.
 *
 * So the offset is measured rather than assumed. Every response carries
 * `serverTime`; comparing it against the local clock at the midpoint of the
 * round trip gives the skew, which is then applied wherever a server timestamp
 * meets a local one.
 */

let offsetMs = 0;
let measured = false;

/**
 * @param serverTime  server's epoch ms, from the response body
 * @param sentAt      local epoch ms just before the request went out
 * @param receivedAt  local epoch ms when the response landed
 */
export function observeServerTime(serverTime: number, sentAt: number, receivedAt: number): void {
  if (!Number.isFinite(serverTime) || serverTime <= 0) return;

  // The server stamped its time somewhere inside the round trip; the midpoint
  // is the best single estimate of when.
  const localMidpoint = sentAt + (receivedAt - sentAt) / 2;
  const sample = serverTime - localMidpoint;

  // Ignore absurd samples — a wildly wrong reading is more likely a stalled
  // response than a genuinely misconfigured clock.
  if (Math.abs(sample) > 6 * 3600_000) return;

  // Smooth after the first reading so one slow response cannot jerk the clock.
  offsetMs = measured ? offsetMs * 0.7 + sample * 0.3 : sample;
  measured = true;
}

/** Now, on the server's clock. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Exposed for the diagnostics row in Settings. */
export function clockOffsetMs(): number {
  return measured ? Math.round(offsetMs) : 0;
}
