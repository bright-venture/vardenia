/** Approved Vardenia website direction. Keys are retained for web and mobile compatibility. */

export const colors = {
  ink: {
    50: '#efe7d9',
    100: '#cec7bc',
    300: '#b7a58d',
    500: '#5e6267',
    700: '#34414d',
    900: '#111d2d',
    950: '#1a1410',
  },
  gold: {
    100: '#f3e7d2',
    300: '#c7ae7c',
    500: '#9b6a20',
    700: '#7e5518',
    900: '#543810',
  },
  cedar: {
    100: '#e6e2d6',
    300: '#6f7fae',
    500: '#24356b',
    700: '#25354a',
    900: '#111d2d',
  },
  surface: {
    base: '#faf8f3',
    raised: '#f3efe7',
    sunken: '#eee9df',
    inverse: '#111d2d',
  },
  state: {
    success: '#3e714f',
    warning: '#9b530d',
    danger: '#a83228',
    info: '#2f5f7f',
  },
  external: {
    whatsapp: '#25d366',
  },
} as const
export const typography = {
  display: {
    family: '"Playfair Display", "Times New Roman", Georgia, serif',
    familyAr: '"Amiri", "Noto Naskh Arabic", serif',
  },
  body: {
    family: '"DM Sans", system-ui, -apple-system, sans-serif',
    familyAr: '"Noto Sans Arabic", sans-serif',
  },
  mono: {
    family: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
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
