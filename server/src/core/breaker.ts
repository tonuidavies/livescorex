/**
 * Per-source circuit breaker.
 *
 * After `threshold` consecutive failures a source is skipped for `cooldownMs`
 * so a dead upstream cannot stall the whole poll cycle. Failover then falls to
 * the next adapter, and if every adapter is open the store keeps serving
 * last-known-good. Blocked must never mean blank.
 */
export class CircuitBreaker {
  private fails = new Map<string, number>();
  private openUntil = new Map<string, number>();

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 5 * 60_000,
  ) {}

  isOpen(name: string): boolean {
    const until = this.openUntil.get(name) ?? 0;
    if (until === 0) return false;
    if (Date.now() >= until) {
      // Cooldown elapsed: half-open, let one probe through.
      this.openUntil.delete(name);
      this.fails.set(name, this.threshold - 1);
      return false;
    }
    return true;
  }

  success(name: string): void {
    this.fails.delete(name);
    this.openUntil.delete(name);
  }

  fail(name: string): void {
    const n = (this.fails.get(name) ?? 0) + 1;
    this.fails.set(name, n);
    if (n >= this.threshold) {
      this.openUntil.set(name, Date.now() + this.cooldownMs);
    }
  }

  status() {
    const out: Record<string, { fails: number; openForMs: number }> = {};
    for (const [name, fails] of this.fails) {
      out[name] = {
        fails,
        openForMs: Math.max(0, (this.openUntil.get(name) ?? 0) - Date.now()),
      };
    }
    return out;
  }
}
