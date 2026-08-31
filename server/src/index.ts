import { createServer } from 'node:http';
import { config } from './config.js';
import { espn } from './sources/espn.js';
import { Scheduler } from './core/scheduler.js';
import { createRestHandler } from './api/rest.js';
import { attachWebSocket } from './api/ws.js';
import { store } from './core/store.js';
import { LEAGUES } from './catalog.js';

/**
 * Source order is priority order. ESPN is primary because it is free,
 * unauthenticated and covers Kenya, Nigeria, Ghana, Uganda, Zambia and
 * Zimbabwe. Add a paid adapter (api-football, Sportmonks) as the last entry
 * and it becomes the floor that stops the app ever going fully dark.
 */
const sched = new Scheduler([espn]);

const server = createServer(createRestHandler(sched));
const ws = attachWebSocket(server);

server.listen(config.port, () => {
  console.log(`[livescorex] listening on :${config.port}`);
  console.log(`[livescorex] ${LEAGUES.length} competitions, odds ${config.oddsEnabled ? 'ON' : 'OFF'}`);
  sched.start();
});

setInterval(() => {
  const h = sched.health();
  console.log(
    `[stat] live=${h.liveMatches} activeLeagues=${h.activeLeagues} ` +
    `known=${h.knownMatches} req=${h.requests} ws=${ws.clients()}`,
  );
}, 60_000).unref();

function shutdown(sig: string) {
  console.log(`\n[livescorex] ${sig} — saving snapshot`);
  store.save();
  sched.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
