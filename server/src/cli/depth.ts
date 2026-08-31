/**
 * Coverage-depth probe.
 *
 * Coverage varies enormously by league: the Premier League returns key events,
 * 28 team stats and a positioned XI; smaller leagues often return scores and a
 * table only. The detail screen needs to know which of its four tabs a league
 * can actually populate so it can hide the rest instead of rendering an empty
 * one.
 *
 *   npm run depth              # tier 1 only
 *   npm run depth -- --all     # every competition (slow, ~259 x 2 requests)
 */
import { espn } from '../sources/espn.js';
import { LEAGUES } from '../catalog.js';
import { dayKey } from '../core/scheduler.js';

const all = process.argv.includes('--all');
const targets = LEAGUES.filter(l => all || l.tier === 1);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Row {
  slug: string; name: string;
  summary: boolean; statistics: boolean; lineup: boolean;
  positions: boolean; standings: boolean; sampled: string | null;
}

/** Walk back up to 14 days to find a played match to inspect. */
async function sample(slug: string): Promise<Row> {
  const base: Row = {
    slug, name: LEAGUES.find(l => l.slug === slug)?.name ?? slug,
    summary: false, statistics: false, lineup: false,
    positions: false, standings: false, sampled: null,
  };

  for (let back = 0; back < 14; back++) {
    const day = dayKey(Date.now() - back * 86_400_000);
    const matches = await espn.fetchLeagueDay(slug, day);
    const played = matches?.find(m => m.state === 'finished');
    if (!played) { await sleep(60); continue; }

    const d = await espn.fetchDetail(slug, played.id);
    if (!d) break;
    return {
      ...base,
      summary: d.available.summary,
      statistics: d.available.statistics,
      lineup: d.available.lineup,
      positions: Boolean(d.lineups?.home.hasPitchPositions),
      standings: d.available.standings,
      sampled: `${played.home.name} v ${played.away.name}`,
    };
  }
  return base;
}

const rows: Row[] = [];
for (const l of targets) {
  const r = await sample(l.slug);
  rows.push(r);
  const tick = (b: boolean) => (b ? '✓' : '·');
  console.log(
    `${r.slug.padEnd(18)} sum:${tick(r.summary)} stats:${tick(r.statistics)} ` +
    `xi:${tick(r.lineup)} pos:${tick(r.positions)} tbl:${tick(r.standings)}  ${r.name}`,
  );
  await sleep(150);
}

const pct = (f: (r: Row) => boolean) =>
  `${rows.filter(f).length}/${rows.length}`;

console.log('\n--- coverage ---');
console.log(`  Summary tab   : ${pct(r => r.summary)}`);
console.log(`  Statistics tab: ${pct(r => r.statistics)}`);
console.log(`  Lineup tab    : ${pct(r => r.lineup)}`);
console.log(`   with pitch xy: ${pct(r => r.positions)}`);
console.log(`  Standings tab : ${pct(r => r.standings)}`);
console.log('\nLeagues with scores only (all detail tabs hidden):');
for (const r of rows) {
  if (!r.summary && !r.statistics && !r.lineup) console.log(`  ${r.slug}  ${r.name}`);
}
