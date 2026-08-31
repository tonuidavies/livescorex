import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { store } from '../core/store.js';
import type { Delta, DeltaFrame } from '../core/schema.js';

/**
 * Delta fan-out.
 *
 * Clients subscribe to league slugs and receive only deltas for matches in
 * those leagues. Each frame carries a monotonic `seq`; a client that sees a
 * gap knows it missed something and can refetch rather than silently drift.
 *
 * This is a single-process implementation. The production shape is one
 * Cloudflare Durable Object per match with WebSocket hibernation, so idle
 * connections between goals cost nothing — see README.
 */
export function attachWebSocket(server: Server): { clients: () => number } {
  const wss = new WebSocketServer({ server, path: '/v1/stream' });

  interface Client { ws: WebSocket; leagues: Set<string> | null; alive: boolean }
  const clients = new Map<WebSocket, Client>();

  wss.on('connection', ws => {
    const client: Client = { ws, leagues: null, alive: true };
    clients.set(ws, client);

    ws.send(JSON.stringify({ type: 'hello', seq: store.currentSeq(), ts: Date.now() }));

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.type === 'subscribe' && Array.isArray(msg.leagues)) {
          client.leagues = new Set(msg.leagues.map(String));
          ws.send(JSON.stringify({ type: 'subscribed', count: client.leagues.size }));
        }
        if (msg?.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      } catch { /* malformed client frames are ignored, never fatal */ }
    });

    ws.on('pong', () => { client.alive = true; });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  // Drop half-open connections — common on mobile networks handing off
  // between cells, and they otherwise accumulate until the process dies.
  const heartbeat = setInterval(() => {
    for (const [ws, c] of clients) {
      if (!c.alive) { ws.terminate(); clients.delete(ws); continue; }
      c.alive = false;
      try { ws.ping(); } catch { /* terminate on the next sweep */ }
    }
  }, 30_000);
  heartbeat.unref();

  store.subscribe((deltas: Delta[], seq: number) => {
    for (const c of clients.values()) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;

      const relevant = c.leagues
        ? deltas.filter(d => {
            const m = store.getMatch(d.id);
            return m ? c.leagues!.has(m.league.slug) : d.t === 'gone';
          })
        : deltas;

      if (!relevant.length) continue;
      const frame: DeltaFrame = { seq, ts: Date.now(), deltas: relevant };
      try { c.ws.send(JSON.stringify(frame)); } catch { /* dropped next heartbeat */ }
    }
  });

  return { clients: () => clients.size };
}
