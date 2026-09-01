/**
 * Design tokens sampled directly from the wireframes.
 *
 * Sampled values: page #1C1B20, chrome #18181B, card #29282D,
 * detail header #2F283B, primary #C94038, LIVE pill #FD0F00,
 * score green #1F9C20.
 *
 * The one deliberate departure is `live`: the sampled green measures ~4.8:1
 * against the page background, which clears AA for the bold score type but is
 * marginal for the small minute label, so the minute uses `liveBright`.
 */

export interface Palette {
  bg: string;
  chrome: string;
  card: string;
  cardAlt: string;
  header: string;
  /** Foot of the match-header gradient. */
  headerDeep: string;
  border: string;
  divider: string;

  text: string;
  textMuted: string;
  textDim: string;

  accent: string;
  accentPressed: string;
  onAccent: string;

  live: string;
  liveBright: string;
  livePill: string;

  yellowCard: string;
  redCard: string;

  markerPromotion: string;
  markerEurope: string;
  markerRelegation: string;

  pitch: string;
  pitchLine: string;
  skeleton: string;
  stale: string;
}

const dark: Palette = {
  bg: '#1C1B20',
  chrome: '#18181B',
  card: '#29282D',
  cardAlt: '#232227',
  header: '#332C40',
  headerDeep: '#241F2E',
  border: '#3A383F',
  divider: '#333238',

  text: '#FFFFFF',
  textMuted: '#8E8D94',
  textDim: '#555458',

  accent: '#C94038',
  accentPressed: '#A9342D',
  onAccent: '#FFFFFF',

  live: '#1F9C20',
  liveBright: '#2FBF31',
  livePill: '#FD0F00',

  yellowCard: '#F2C230',
  redCard: '#D63B33',

  markerPromotion: '#2FBF31',
  markerEurope: '#E08A2E',
  markerRelegation: '#D63B33',

  pitch: '#2A3F35',
  pitchLine: 'rgba(255,255,255,0.22)',
  skeleton: '#26252A',
  stale: '#E0A32E',
};

const light: Palette = {
  bg: '#F4F4F6',
  chrome: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#ECECEF',
  header: '#413859',
  headerDeep: '#2E2740',
  border: '#DCDCE2',
  divider: '#E6E6EA',

  text: '#131316',
  textMuted: '#6A6972',
  textDim: '#9A99A2',

  accent: '#C94038',
  accentPressed: '#A9342D',
  onAccent: '#FFFFFF',

  live: '#12801A',
  liveBright: '#12801A',
  livePill: '#E01000',

  yellowCard: '#D9A81B',
  redCard: '#C62F28',

  markerPromotion: '#12801A',
  markerEurope: '#C4761F',
  markerRelegation: '#C62F28',

  pitch: '#2A3F35',
  pitchLine: 'rgba(255,255,255,0.22)',
  skeleton: '#E4E4E8',
  stale: '#B57E12',
};

export const palettes = { dark, light } as const;
export type ThemeName = keyof typeof palettes;

export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40,
} as const;

export const radius = {
  sm: 6, md: 10, lg: 14, pill: 999,
} as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/**
 * Tabular figures for anything that changes in place.
 *
 * Proportional digits are different widths, so a clock ticking 1 -> 2 -> 3
 * shifts everything beside it every second, and a score flipping 0 -> 1 nudges
 * the row. This is a legibility fix, not a flourish.
 */
export const tabular = { fontVariant: ['tabular-nums' as const] };

export const type = {
  h1: { fontFamily: font.bold, fontSize: 30, lineHeight: 38 },
  h2: { fontFamily: font.bold, fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyMed: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  team: { fontFamily: font.semibold, fontSize: 15.5, lineHeight: 20 },
  score: { fontFamily: font.bold, fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums' as const] },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 15 },
  tab: { fontFamily: font.medium, fontSize: 11, lineHeight: 14 },
} as const;
