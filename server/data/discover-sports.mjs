/**
 * Build the multi-sport league catalogue.
 *
 * ESPN exposes 17 sports, and the team ones — basketball, baseball, hockey,
 * American football, Aussie rules, rugby, volleyball, lacrosse — return
 * *exactly* the same scoreboard shape as soccer: two competitors with
 * homeAway and a score. That means the existing normaliser already handles
 * them and adding a sport is a catalogue entry, not a new adapter.
 *
 * Individual sports (tennis, golf, racing, MMA) are deliberately excluded:
 * their events carry no competitors at all at this level, so they would list
 * in the menu and then show nothing, which is worse than not listing them.
 *
 *   node data/discover-sports.mjs
 */
import { writeFileSync } from 'node:fs';

const H = { 'User-Agent': 'LivescoreX/0.1', Accept: 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const get = async url => {
  try {
    const r = await fetch(url, { headers: H });
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

/** Team sports only — see the note above. */
const TEAM_SPORTS = {
  basketball: 'Basketball',
  baseball: 'Baseball',
  hockey: 'Ice Hockey',
  football: 'American Football',
  'australian-football': 'Aussie Rules',
  rugby: 'Rugby Union',
  'rugby-league': 'Rugby League',
  volleyball: 'Volleyball',
  lacrosse: 'Lacrosse',
  'field-hockey': 'Field Hockey',
  'water-polo': 'Water Polo',
  cricket: 'Cricket',
};

/** Nicer names than the slug for the ones people actually look for. */
const PRETTY = {
  nba: 'NBA', wnba: 'WNBA', 'mens-college-basketball': "NCAA Men's Basketball",
  'womens-college-basketball': "NCAA Women's Basketball", nbl: 'NBL Australia',
  fiba: 'FIBA', mlb: 'MLB', 'college-baseball': 'NCAA Baseball',
  'world-baseball-classic': 'World Baseball Classic', nhl: 'NHL',
  'mens-college-hockey': 'NCAA Men’s Hockey', nfl: 'NFL',
  'college-football': 'NCAA Football', cfl: 'CFL', ufl: 'UFL', xfl: 'XFL',
  afl: 'AFL',
};

const results = [];

for (const [sport, sportName] of Object.entries(TEAM_SPORTS)) {
  const index = await get(`https://sports.core.api.espn.com/v2/sports/${sport}/leagues?limit=200`);
  const refs = (index?.items ?? []).map(i => i.$ref.split('?')[0]);
  if (refs.length === 0) {
    console.log(`${sport}: no leagues listed`);
    continue;
  }

  let kept = 0;
  for (const ref of refs) {
    const meta = await get(ref);
    const slug = meta?.slug;
    if (!slug) continue;

    // A league only earns a place if its scoreboard answers with the
    // two-competitor team shape the normaliser understands.
    const sb = await get(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${slug}/scoreboard`);
    const ev = sb?.events?.[0];
    const competitors = ev?.competitions?.[0]?.competitors ?? [];
    if (!sb?.leagues?.[0] || competitors.length !== 2) { await sleep(40); continue; }

    const league = sb.leagues[0];
    const logos = league.logos ?? [];
    const usable = h => (h && !h.includes('default-team-logo') ? h : null);

    results.push({
      sport,
      sportName,
      slug: `${sport}/${slug}`,
      leagueSlug: slug,
      name: PRETTY[slug] ?? league.name ?? slug,
      abbreviation: league.abbreviation ?? null,
      logo: usable(logos.find(l => l?.rel?.includes('full') && !l?.rel?.includes('dark'))?.href) ?? null,
      logoDark: usable(logos.find(l => l?.rel?.includes('dark'))?.href) ?? null,
    });
    kept += 1;
    await sleep(60);
  }
  console.log(`${sport.padEnd(20)} ${kept} usable of ${refs.length}`);
}

results.sort((a, b) => a.sport.localeCompare(b.sport) || a.name.localeCompare(b.name));
writeFileSync(new URL('./sports.json', import.meta.url), JSON.stringify(results, null, 1));
console.log(`\nwrote ${results.length} non-football leagues across ${new Set(results.map(r => r.sport)).size} sports`);
