/**
 * Raw design tokens — the SAME values mapped into `tailwind.config.js`
 * `theme.extend`, re-exported here as plain constants for the components that
 * cannot use NativeWind classes (Reanimated worklets + `StyleSheet`).
 *
 * RULE: no hex color literal may exist anywhere outside `tailwind.config.js`
 * and this file. Reference these constants instead.
 */

export const colors = {
  ink: '#24241c',
  paper: '#fdfdfb',
  accent: { DEFAULT: '#336ca2', tint: '#9cc4e8', soft: '#eaf1f8', ondark: '#dbe9f5' },
  line: { DEFAULT: '#e2e1d8', strong: '#d8d7cc', dashed: '#c7c6bb' },
  muted: { DEFAULT: '#6b6b60', 2: '#8a8a80', 3: '#a3a294', 4: '#b5b4a8' },
  rec: '#c23b3b',
  disabled: { bg: '#e2e1d8', text: '#a3a294' },
  white: '#ffffff',
} as const;

/** 45% ink scrim behind the summary/sheet overlay. */
export const scrim = 'rgba(36,36,28,0.45)' as const;

export const radius = { card: 14, hero: 18, row: 12, pill: 999, sheet: 22 } as const;

/** Border hairline — matches tailwind `borderWidth.DEFAULT`. */
export const borderWidth = 1.5 as const;

export const space = { screen: 20, tap: 44, btn: 52, fab: 56 } as const;

export const fontSize = {
  hero: 42,
  money: 38,
  moneyLg: 40,
  moneySm: 36,
  title: 24,
  titleLg: 28,
  body: 15,
  btn: 16,
  sec: 12.5,
  secLg: 13.5,
  mono: 11,
  monoSm: 10,
  monoXs: 9.5,
} as const;

/** Letter-spacing in px (React Native uses px, not em). */
export const letterSpacing = { heading: -0.8, headingHero: -1.1, monowide: 0.9 } as const;

export const fontFamily = {
  grotesk: 'SpaceGrotesk_400Regular',
  groteskMedium: 'SpaceGrotesk_500Medium',
  groteskSemibold: 'SpaceGrotesk_600SemiBold',
  groteskBold: 'SpaceGrotesk_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

/** Animation / timing constants (ms). */
export const duration = {
  toastIn: 250,
  toastAuto: 2400,
  sheetIn: 300,
} as const;
