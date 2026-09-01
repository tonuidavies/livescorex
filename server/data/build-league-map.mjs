/**
 * Build the FotMob -> ESPN league mapping.
 *
 * Two sources describe the same competitions with different ids and slightly
 * different names ("Premier League" vs "English Premier League"), so without a
 * mapping the merged feed shows England twice and every big match twice. This
 * is the entity-mapping table; get it right once and everything downstream is
 * simple.
 *
 * Matching is country-scoped token overlap. Anything ambiguous is left
 * unmapped, which is the safe failure: an unmapped FotMob league appears as
 * its own group rather than being wrongly merged into someone else's.
 *
 *   node data/build-league-map.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const H = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const espn = JSON.parse(readFileSync(new URL('./leagues.json', import.meta.url), 'utf8'));

/** FotMob ccode -> ESPN slug prefix, where the two disagree. */
const CC = {
  ENG: 'eng', ESP: 'esp', ITA: 'ita', GER: 'ger', FRA: 'fra', NED: 'ned',
  POR: 'por', SCO: 'sco', WAL: 'wal', NIR: 'nir', IRL: 'irl', BEL: 'bel',
  TUR: 'tur', GRE: 'gre', RUS: 'rus', UKR: 'ukr', POL: 'pol', CZE: 'cze',
  AUT: 'aut', SUI: 'sui', DEN: 'den', NOR: 'nor', SWE: 'swe', FIN: 'fin',
  ROU: 'rou', CRO: 'cro', SRB: 'srb', BUL: 'bul', HUN: 'hun', CYP: 'cyp',
  ISR: 'isr', USA: 'usa', MEX: 'mex', BRA: 'bra', ARG: 'arg', CHI: 'chi',
  COL: 'col', URU: 'uru', PER: 'per', ECU: 'ecu', PAR: 'par', BOL: 'bol',
  VEN: 'ven', JPN: 'jpn', KOR: 'kor', CHN: 'chn', AUS: 'aus', IND: 'ind',
  IDN: 'idn', THA: 'tha', KSA: 'ksa', QAT: 'qat', UAE: 'uae', EGY: 'egy',
  RSA: 'rsa', NGA: 'nga', GHA: 'gha', MAR: 'mar', TUN: 'tun', ALG: 'alg',
  CAN: 'can', CRC: 'crc', GUA: 'gua', HON: 'hon', SLV: 'slv', JAM: 'jam',
  MLT: 'mlt', SVK: 'svk', SVN: 'svn', EST: 'est', LVA: 'lva', LTU: 'ltu',
  // International competitions are spread across confederation prefixes in the
  // ESPN catalogue, so INT has to consider all of them — otherwise the single
  // biggest competition in the app, the UEFA Champions League, never maps.
  INT: ['uefa', 'caf', 'concacaf', 'conmebol', 'afc', 'aff', 'fifa', 'global',
        'campeones', 'club', 'friendly', 'nonfifa'],
};

const STOP = new Set([
  'league', 'liga', 'division', 'divisao', 'divisione', 'serie', 'primera',
  'premier', 'pro', 'professional', 'first', 'the', 'de', 'del', 'la', 'el',
  'championship', 'football', 'soccer', 'national', 'cup', 'copa', 'coupe',
]);

const norm = s =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean);

const sig = s => norm(s).filter(w => !STOP.has(w));

/** Jaccard over significant tokens, with a bonus for a full-name containment. */
function similarity(a, b) {
  const A = new Set(sig(a));
  const B = new Set(sig(b));
  if (A.size === 0 || B.size === 0) {
    // Both reduce to stop words ("Premier League" vs "Premier League"): fall
    // back to the raw token sets so these are still comparable.
    const A2 = new Set(norm(a)); const B2 = new Set(norm(b));
    const inter2 = [...A2].filter(x => B2.has(x)).length;
    return inter2 / Math.max(A2.size, B2.size, 1);
  }
  const inter = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return inter / union;
}

const res = await fetch('https://www.fotmob.com/api/data/allLeagues', { headers: H });
const all = await res.json();

const fmLeagues = [];
const walk = (node, ccode) => {
  if (Array.isArray(node)) return node.forEach(n => walk(n, ccode));
  if (!node || typeof node !== 'object') return;
  const cc = node.ccode ?? ccode;
  if (node.id && node.name && !node.leagues) fmLeagues.push({ id: node.id, name: node.name, ccode: cc });
  for (const [k, v] of Object.entries(node)) {
    if (k === 'leagues' || Array.isArray(v) || (v && typeof v === 'object')) walk(v, node.ccode ?? cc);
  }
};
walk(all, null);

const seen = new Set();
const unique = fmLeagues.filter(l => {
  const k = `${l.id}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

/**
 * Competition "kind" guards.
 *
 * Name similarity alone happily maps "Austrian Cup" onto "Austrian Bundesliga"
 * and every women's Champions League onto every other one. A wrong mapping is
 * worse than none — it merges two unrelated competitions into one group and
 * hides half the fixtures — so these attributes must agree exactly before a
 * pair is even scored.
 */
const attrs = name => {
  const n = ` ${String(name).toLowerCase()} `;
  const youth = (n.match(/\bu[- ]?(15|16|17|19|20|21|23)\b/) ?? [])[1] ?? null;
  return {
    women: /\bw\b|\bwomen|\bfemenin|\bvrouwen|\bfeminin|\bdamallsvenskan|\breina\b/.test(n),
    youth,
    qualifying: /qualif|preliminar|playoff|play-off|promotion|relegation/.test(n),
    cup: /\bcup\b|\bcopa\b|\bcoupe\b|\bpokal\b|\bbeker\b|\btaca\b|\btaça\b|\bcoppa\b|\btrophy\b|\bshield\b|\bsupercopa\b|\bsuper cup\b/.test(n),
    // Confederation-scoped competitions must not cross-map.
    conf: (n.match(/\b(uefa|caf|concacaf|conmebol|afc|fifa|ofc)\b/) ?? [])[1] ?? null,
  };
};

const compatible = (a, b) => {
  const x = attrs(a), y = attrs(b);
  if (x.women !== y.women) return false;
  if (x.youth !== y.youth) return false;
  if (x.qualifying !== y.qualifying) return false;
  if (x.cup !== y.cup) return false;
  if (x.conf && y.conf && x.conf !== y.conf) return false;
  return true;
};

/**
 * Curated mappings for the competitions that matter most.
 *
 * Fuzzy matching cannot separate FotMob's bare "Champions League" from the
 * CAF one — both reduce to the token "champions" and tie at 0.50, so the
 * biggest competition in the app was silently landing on African football.
 * Names this consequential are pinned by id and the matcher handles the tail.
 *
 * Ids verified against FotMob's own allLeagues index.
 */
const OVERRIDES = {
  'fotmob:42': 'uefa.champions',
  'fotmob:73': 'uefa.europa',
  'fotmob:10216': 'uefa.europa.conf',
  'fotmob:47': 'eng.1',
  'fotmob:48': 'eng.2',
  'fotmob:87': 'esp.1',
  'fotmob:55': 'ita.1',
  'fotmob:54': 'ger.1',
  'fotmob:53': 'fra.1',
  'fotmob:57': 'ned.1',
  'fotmob:61': 'por.1',
  'fotmob:71': 'tur.1',
  'fotmob:64': 'sco.1',
  'fotmob:112': 'arg.1',
  'fotmob:268': 'bra.1',
  'fotmob:130': 'usa.1',
  'fotmob:536': 'ksa.1',
  'fotmob:230': 'mex.1',
  'fotmob:526': 'caf.champions',
  'fotmob:289': 'caf.nations',
};

const map = {};
const report = [];
const rejected = [];
/** Best FotMob candidate per ESPN slug, so the mapping stays one-to-one. */
const claimed = new Map();

// Pin the curated set first so the matcher can never claim those slugs.
for (const [key, slug] of Object.entries(OVERRIDES)) {
  map[key] = slug;
  claimed.set(slug, { score: 99, name: 'curated', key });
}

for (const fm of unique) {
  if (map[`fotmob:${fm.id}`]) continue;
  const prefix = CC[String(fm.ccode ?? '').toUpperCase()];
  if (!prefix) continue;
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  const candidates = espn.filter(e => prefixes.includes(e.slug.split('.')[0]));
  if (!candidates.length) continue;

  let best = null;
  for (const c of candidates) {
    if (!compatible(fm.name, c.name)) continue;
    const score = similarity(fm.name, c.name);
    if (!best || score > best.score) best = { score, slug: c.slug, name: c.name };
  }
  if (!best || best.score < 0.5) {
    if (best) rejected.push(`${fm.name} ~ ${best.name} (${best.score.toFixed(2)})`);
    continue;
  }
  // One-to-one: if two FotMob leagues both claim an ESPN slug, the better
  // score wins and the loser stays unmapped rather than colliding.
  const prior = claimed.get(best.slug);
  if (prior && prior.score >= best.score) {
    rejected.push(`${fm.name} lost ${best.slug} to ${prior.name}`);
    continue;
  }
  if (prior) { delete map[prior.key]; }
  const key = `fotmob:${fm.id}`;
  claimed.set(best.slug, { score: best.score, name: fm.name, key });
  map[key] = best.slug;
  report.push(`${String(fm.ccode).padEnd(4)} ${fm.name.slice(0,30).padEnd(32)} -> ${best.slug.padEnd(18)} ${best.name.slice(0,26)}  (${best.score.toFixed(2)})`);
}

writeFileSync(new URL('./league-map.json', import.meta.url), JSON.stringify(map, null, 1));
console.log(`FotMob leagues scanned: ${unique.length}`);
console.log(`mapped to ESPN slugs  : ${Object.keys(map).length}`);
console.log(`rejected by guards    : ${rejected.length}`);
console.log('\nsample mappings:');
console.log(report.slice(0, 20).join('\n'));
console.log('\nsample rejects:');
console.log(rejected.slice(0, 8).join('\n'));
