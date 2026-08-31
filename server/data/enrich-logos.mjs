/**
 * One-off: harvest real competition logo URLs into leagues.json.
 *
 * The logo path uses an internal image id (Premier League is 23) that has no
 * relation to the league id (700) or the slug, so it cannot be constructed —
 * it has to be read from the API and stored.
 *
 *   node data/enrich-logos.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('./leagues.json', import.meta.url);
const leagues = JSON.parse(readFileSync(PATH, 'utf8'));

const H = { 'User-Agent': 'LivescoreX/0.1', Accept: 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const usable = href =>
  href && !href.includes('default-team-logo') ? href : null;

/**
 * Returns { logo, logoDark }.
 *
 * Many competition marks are dark artwork on a transparent ground — the
 * Premier League lion is near-black — so on a dark background the light
 * variant disappears. ESPN publishes a `500-dark` counterpart; both are stored
 * and the app picks by theme.
 */
async function logoFor(slug) {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`,
      { headers: H },
    );
    if (!res.ok) return { logo: null, logoDark: null };
    const d = await res.json();
    const logos = d?.leagues?.[0]?.logos ?? [];
    const light = logos.find(l => l?.rel?.includes('full') && !l?.rel?.includes('dark'));
    const dark = logos.find(l => l?.rel?.includes('dark'));
    return {
      logo: usable((light ?? logos[0])?.href),
      logoDark: usable(dark?.href),
    };
  } catch {
    return { logo: null, logoDark: null };
  }
}

let found = 0;
const CONCURRENCY = 6;
let cursor = 0;

async function worker() {
  while (cursor < leagues.length) {
    const l = leagues[cursor++];
    const { logo, logoDark } = await logoFor(l.slug);
    l.logo = logo;
    l.logoDark = logoDark;
    if (logo) found++;
    await sleep(40);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

writeFileSync(PATH, JSON.stringify(leagues, null, 1));
console.log(`logos found for ${found}/${leagues.length} competitions`);
