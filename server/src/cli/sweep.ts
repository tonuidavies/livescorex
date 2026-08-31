/**
 * One-shot fixture sweep, for cron or a manual warm-up.
 *   npm run sweep -- 20260831
 */
import { espn } from '../sources/espn.js';
import { LEAGUES } from '../catalog.js';
import { store } from '../core/store.js';
import { dayKey } from '../core/scheduler.js';

const day = process.argv[2] ?? dayKey();
console.log(`sweeping ${LEAGUES.length} competitions for ${day}`);

let ok = 0, empty = 0, failed = 0, matches = 0;
const CONCURRENCY = 6;
let cursor = 0;

async function worker() {
  while (cursor < LEAGUES.length) {
    const l = LEAGUES[cursor++];
    if (!l) break;
    const res = await espn.fetchLeagueDay(l.slug, day);
    if (res === null) { failed++; continue; }
    if (res.length === 0) { empty++; continue; }
    ok++; matches += res.length;
    store.applyLeagueDay(day, l.slug, res);
    console.log(`  ${l.slug.padEnd(20)} ${String(res.length).padStart(3)}  ${l.name}`);
    await new Promise(r => setTimeout(r, 40));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

store.save();
console.log(`\nleagues with fixtures: ${ok}   no fixtures: ${empty}   failed: ${failed}`);
console.log(`total matches: ${matches}`);
process.exit(0);
