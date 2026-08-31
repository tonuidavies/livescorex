import type { League } from './core/schema.js';
import { config, readJson } from './config.js';

interface RawLeague {
  slug: string;
  name: string;
  listed: boolean;
  eventsAtProbe: number | null;
  tier: 1 | 2;
  /** Both harvested by data/enrich-logos.mjs — see below. */
  logo?: string | null;
  logoDark?: string | null;
}

/**
 * Display names for slug prefixes. ESPN uses FIFA-style codes (GER not DEU,
 * NED not NLD, RSA not ZAF), plus confederation and global pseudo-countries.
 */
const COUNTRY: Record<string, string> = {
  arg: 'Argentina', aus: 'Australia', aut: 'Austria', bel: 'Belgium',
  bol: 'Bolivia', bra: 'Brazil', can: 'Canada', chi: 'Chile', chn: 'China',
  col: 'Colombia', crc: 'Costa Rica', cyp: 'Cyprus', cze: 'Czechia',
  den: 'Denmark', ecu: 'Ecuador', eng: 'England', esp: 'Spain',
  fin: 'Finland', fra: 'France', ger: 'Germany', gha: 'Ghana', gre: 'Greece',
  gua: 'Guatemala', hon: 'Honduras', idn: 'Indonesia', ind: 'India',
  irl: 'Ireland', isr: 'Israel', ita: 'Italy', jam: 'Jamaica', jpn: 'Japan',
  ken: 'Kenya', ksa: 'Saudi Arabia', mex: 'Mexico', mlt: 'Malta',
  ned: 'Netherlands', nga: 'Nigeria', nir: 'Northern Ireland', nor: 'Norway',
  par: 'Paraguay', per: 'Peru', por: 'Portugal', rou: 'Romania',
  rsa: 'South Africa', rus: 'Russia', sco: 'Scotland', slv: 'El Salvador',
  sui: 'Switzerland', swe: 'Sweden', tha: 'Thailand', tur: 'Türkiye',
  uga: 'Uganda', uru: 'Uruguay', usa: 'United States', ven: 'Venezuela',
  wal: 'Wales', zam: 'Zambia', zim: 'Zimbabwe',

  // Confederations and cross-border competitions
  afc: 'Asia', aff: 'ASEAN', caf: 'Africa', concacaf: 'CONCACAF',
  conmebol: 'South America', uefa: 'Europe', fifa: 'International',
  campeones: 'International', club: 'International', friendly: 'International',
  global: 'International', nonfifa: 'International',
};

/** Flag emoji is unreliable across Android OEM fonts — the app ships SVG flags
 *  keyed by this code instead. Kept here so one place owns the mapping. */
export function countryName(code: string): string {
  return COUNTRY[code] ?? code.toUpperCase();
}

const raw = readJson<RawLeague[]>('leagues.json');

const forcedTier1 = new Set(config.tier1Extra);

export const LEAGUES: League[] = raw.map(r => {
  const country = r.slug.split('.')[0] ?? r.slug;
  return {
    slug: r.slug,
    name: r.name,
    country,
    countryName: countryName(country),
    flag: null,
    // Not constructible: the logo path uses an internal image id (the Premier
    // League is 23) unrelated to the league id (700) or the slug, so it is
    // harvested into leagues.json by data/enrich-logos.mjs. 174 of 259
    // competitions have one; the rest fall back to the country initial.
    logo: r.logo ?? null,
    logoDark: r.logoDark ?? null,
    tier: (forcedTier1.has(r.slug) ? 1 : r.tier) as 1 | 2,
  };
});

export const LEAGUE_BY_SLUG = new Map(LEAGUES.map(l => [l.slug, l]));

export function getLeague(slug: string): League {
  return (
    LEAGUE_BY_SLUG.get(slug) ?? {
      slug,
      name: slug,
      country: slug.split('.')[0] ?? slug,
      countryName: countryName(slug.split('.')[0] ?? slug),
      flag: null,
      logo: null,
      logoDark: null,
      tier: 2,
    }
  );
}

/** Seeded into onboarding as pre-ticked favourites for the Kenyan market. */
export const DEFAULT_LEAGUES = [
  'ken.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1',
  'uefa.champions', 'caf.champions', 'nga.1', 'gha.1', 'uga.1',
];
