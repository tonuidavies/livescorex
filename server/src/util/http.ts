import { userAgent, config } from '../config.js';

export interface FetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** true when the server answered 304 and the caller should keep its copy */
  notModified: boolean;
  etag: string | null;
}

const etags = new Map<string, string>();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Conditional GET with bounded retry.
 *
 * Politeness is the anti-blocking strategy: a plain identifying User-Agent,
 * a contact header so an upstream ops team can reach us instead of banning us,
 * conditional requests so unchanged data costs a 304, and exponential backoff
 * with jitter so a struggling upstream is never hammered. Most blocking is
 * earned; being genuinely light usually means never earning it.
 */
export async function getJson<T>(
  url: string,
  opts: { timeoutMs?: number; retries?: number; conditional?: boolean } = {},
): Promise<FetchResult<T>> {
  const { timeoutMs = 15_000, retries = 2, conditional = true } = opts;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'X-Contact': config.contactUrl,
      };
      const prev = conditional ? etags.get(url) : undefined;
      if (prev) headers['If-None-Match'] = prev;

      const res = await fetch(url, { headers, signal: ctrl.signal });
      lastStatus = res.status;

      if (res.status === 304) {
        return { ok: true, status: 304, data: null, notModified: true, etag: prev ?? null };
      }
      if (res.status === 429 || res.status >= 500) {
        // Back off and retry — never tight-loop a failing endpoint.
        if (attempt < retries) {
          const base = 500 * 2 ** attempt;
          await sleep(base + Math.random() * base);
          continue;
        }
        return { ok: false, status: res.status, data: null, notModified: false, etag: null };
      }
      if (!res.ok) {
        return { ok: false, status: res.status, data: null, notModified: false, etag: null };
      }

      const etag = res.headers.get('etag');
      if (etag && conditional) etags.set(url, etag);
      const data = (await res.json()) as T;
      return { ok: true, status: res.status, data, notModified: false, etag };
    } catch {
      if (attempt < retries) {
        const base = 500 * 2 ** attempt;
        await sleep(base + Math.random() * base);
        continue;
      }
      return { ok: false, status: lastStatus, data: null, notModified: false, etag: null };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: lastStatus, data: null, notModified: false, etag: null };
}
