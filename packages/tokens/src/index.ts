/**
 * Design tokens - the one place brand values live.
 *
 * Web consumes these through the Tailwind theme; mobile imports them directly.
 * We deliberately do NOT share React components between Next and React Native
 * (the abstraction costs more than it saves at this size) - we share the values
 * that make both surfaces look like the same brand.
 *
 * # The palette, and why it is this one
 *
 * The ground is cedar rather than cream or near-black. Cream with a serif and a
 * warm accent is the house style of every template on the market, and black is
 * what a brand picks when it has not decided anything. A deep cedar green reads
 * as Lebanon without illustrating it, and it is dark enough to carry white type
 * and gold foil at print contrast.
 *
 * Gold is unchanged from the first pass and is deliberately rationed: hairlines,
 * small caps, one-pixel rules, the pressed state of a control. It is a foil
 * stamp, not a fill. The moment it becomes a background it stops reading as
 * expensive.
 *
 * Every neutral carries a slight green bias, so no grey on the page looks like
 * it was inherited from a framework default. That is the difference between a
 * palette that was chosen and one that was accepted.
 *
 * # Keys are contract, values are not
 *
 * Tailwind is generated from this object, so `ink.500` is referenced as
 * `text-ink-500` in around forty components. Renaming a key is a refactor across
 * the whole app; changing a hex is a rebrand and touches nothing else. Keep the
 * key set stable and this file stays the only place brand colour lives.
 */

export const colors = {
  // Editorial body text. Biased green rather than blue so it sits with cedar.
  ink: {
    50: '#f6f7f6',
    100: '#e3e7e4',
    300: '#9da9a9',
    500: '#5e6c6e',
    700: '#2e3b3e',
    900: '#101a1d',
    950: '#080f11',
  },
  // Accent: warm metallic, the "premium" signal in print and digital alike.
  // Used as foil - rules, small caps, pressed states - and never as a fill.
  gold: {
    100: '#f8efdc',
    300: '#e8d4a3',
    500: '#c9a227',
    700: '#8f7118',
    900: '#5e4a10',
  },
  // Lebanon cedar. 900 is the brand ground: mastheads, footers, dark panels.
  cedar: {
    100: '#e3ede6',
    300: '#a9c4b4',
    500: '#3f7255',
    700: '#1b4438',
    900: '#10302a',
  },
  surface: {
    base: '#ffffff',
    // Limestone. Cooler than a cream so it reads as stone rather than paper.
    raised: '#f7f7f4',
    sunken: '#edeee9',
    // Cedar, not near-black: an inverted panel should still be the brand.
    inverse: '#10302a',
  },
  state: {
    success: '#2f7d54',
    warning: '#b8860b',
    danger: '#b3261e',
    info: '#2c5f8a',
  },
} as const

/**
 * # Why Fraunces and not Canela
 *
 * Canela is licensed per-domain and was never bought, so naming it in a font
 * stack achieved nothing: the browser skipped it and every headline on the site
 * rendered in Times New Roman. Fraunces is a variable serif with real optical
 * sizing, it is free, and it is close enough in voice that swapping to Canela
 * later is one line here. A face that loads beats a better face that does not.
 *
 * The mono is not decoration. Reference codes and price marks are set in it
 * because every listing has a printed twin, and a catalogue number is the cue
 * that says so.
 */
export const typography = {
  // Editorial serif for headlines; the magazine voice carries to the web.
  display: {
    family: '"Fraunces", "Times New Roman", Georgia, serif',
    familyAr: '"Tajawal", "Noto Kufi Arabic", sans-serif',
  },
  body: {
    family: '"Inter", system-ui, -apple-system, sans-serif',
    familyAr: '"IBM Plex Sans Arabic", "Noto Sans Arabic", sans-serif',
  },
  // Reference codes, price marks, and anything that lines up in a column.
  mono: {
    family: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  scale: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 36,
    '4xl': 48,
    '5xl': 64,
  },
  lineHeight: {
    tight: 1.1,
    snug: 1.3,
    normal: 1.55,
    relaxed: 1.75,
  },
} as const

/** 4px base grid. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const

export const radius = {
  none: 0,
  sm: 2,
  md: 6,
  lg: 12,
  xl: 20,
  full: 9999,
} as const

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export const motion = {
  duration: { fast: 150, base: 250, slow: 400, editorial: 700 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  },
} as const
