/**
 * Design tokens - the one place brand values live.
 *
 * Web consumes these through the Tailwind theme; mobile imports them directly.
 * We deliberately do NOT share React components between Next and React Native
 * (the abstraction costs more than it saves at this size) - we share the values
 * that make both surfaces look like the same brand.
 *
 * Palette placeholder: replace with the final brand colours once the identity
 * is signed off. Structure stays; hex values change in this file only.
 */

export const colors = {
  // Deep ink - editorial body text, premium dark surfaces.
  ink: {
    50: '#f5f6f7',
    100: '#e5e7ea',
    300: '#a8aeb8',
    500: '#5c6472',
    700: '#333a47',
    900: '#14181f',
    950: '#0a0d12',
  },
  // Accent: warm metallic, the "premium" signal in print and digital alike.
  gold: {
    100: '#f8efdc',
    300: '#e8d4a3',
    500: '#c9a227',
    700: '#96771a',
    900: '#5e4a10',
  },
  // Lebanon cedar green, used sparingly for provenance cues.
  cedar: {
    100: '#e3ede6',
    500: '#3f7255',
    700: '#2a4d3a',
  },
  surface: {
    base: '#ffffff',
    raised: '#fbfaf8',
    sunken: '#f2f0ec',
    inverse: '#0a0d12',
  },
  state: {
    success: '#2f7d54',
    warning: '#b8860b',
    danger: '#b3261e',
    info: '#2c5f8a',
  },
} as const

export const typography = {
  // Editorial serif for headlines; the magazine voice carries to the web.
  display: {
    family: '"Canela", "Times New Roman", Georgia, serif',
    familyAr: '"Tajawal", "Noto Kufi Arabic", sans-serif',
  },
  body: {
    family: '"Inter", system-ui, -apple-system, sans-serif',
    familyAr: '"IBM Plex Sans Arabic", "Noto Sans Arabic", sans-serif',
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
