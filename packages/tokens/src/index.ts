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
 * Adopted from the commissioned design, August 2026. It replaces an earlier
 * palette built on a white ground, cedar green and brass gold.
 *
 * That earlier version argued, in this comment, that cream with a serif and a
 * warm accent was "the house style of every template on the market". The
 * argument is not wrong in general and it lost anyway, for a specific reason:
 * this product's other half is printed. A page whose ground is paper rather
 * than screen-white is the closest a browser gets to the object the reader is
 * holding, and the continuity between the two is the whole proposition. The
 * risk of looking generic is real and is answered by the typography and the
 * restraint, not by refusing warmth.
 *
 * The ground is ivory. Dark panels are navy rather than cedar - deeper, and it
 * carries gold at print contrast without the green cast that made photographs
 * sit badly. Body text is espresso, a warm near-black, because a cool grey on a
 * warm ground reads as a mistake.
 *
 * Gold moved from brass to bronze and is no longer rationed to hairlines: the
 * design uses it as a fill on primary controls. On ivory a bright brass fill
 * glares; bronze holds.
 *
 * # Keys are contract, values are not
 *
 * Tailwind is generated from this object, so `ink.500` is referenced as
 * `text-ink-500` in 57 components and 431 places. Renaming a key is a refactor
 * across the whole app; changing a hex is a rebrand and touches nothing else.
 * This rebrand changed only values, which is why it was one file.
 *
 * Keep the key set stable and this file stays the only place brand colour lives.
 */

export const colors = {
  /**
   * Editorial body text: espresso, a warm near-black.
   *
   * The design sets body copy in `espresso` and secondary copy in `espresso/50`,
   * with hairlines at `espresso/15` and `/20`. Alpha over a known ground is the
   * same thing as a solid value, and a solid one composites correctly over a
   * photograph as well - so the mid and light steps here are those alphas
   * flattened onto the ivory ground rather than picked by eye.
   *
   *   100  espresso at 20% over ivory   hairlines and card borders
   *
   * 300 is the design's own `taupe`, which it uses for muted labels on dark.
   *
   * # 500 is the one deliberate departure from the design
   *
   * The design's `espresso/50` flattens to #918980, which is 3.04:1 on ivory.
   * That is below the 4.5:1 WCAG AA minimum for body text, and this token is
   * secondary copy in 57 components - so it would have been the most-read
   * failing colour on the site rather than an edge case. The palette it replaces
   * managed 5.46:1.
   *
   * 64% is the first step that clears AA, at 4.56:1. Two shades darker than
   * drawn, and the alternative was shipping a readability regression as part of
   * a redesign. Worth showing the designer; not worth waiting to fix.
   */
  ink: {
    50: '#efe7d9',
    100: '#cec7bc',
    300: '#b7a58d',
    500: '#746c63',
    700: '#4a3e33',
    900: '#2a211b',
    950: '#1a1410',
  },
  /**
   * Accent: bronze rather than brass.
   *
   * 500 and 700 are the design's `gold` and `gold-deep` exactly - the two it
   * actually uses, on rules, small caps and the fill of a primary button. The
   * other three steps are extrapolated for washes and pressed states.
   */
  gold: {
    100: '#f3e7d2',
    300: '#c79a56',
    500: '#9b6a20',
    700: '#7e5518',
    900: '#543810',
  },
  /**
   * Navy, under a key that still says cedar.
   *
   * # Why the name lies, and why that is the right trade
   *
   * The key set is the contract - renaming it is a refactor across 57
   * components - so what matters is what the key is *used for*, not what it is
   * called. Counted before remapping, `cedar` was:
   *
   *   15 uses   the dark ground: bg-cedar-900, bg-cedar-700, gradients,
   *             text-cedar-100 for copy sitting on it
   *    3 uses   dark text on a gold fill
   *    2 uses   a semantic green: "Verified", "Open now"
   *
   * So it is overwhelmingly the dark panel, and in this design dark panels are
   * navy. Mapping it to olive - the design's actual green - was tried first and
   * left the masthead green, which is how this got counted properly.
   *
   * The two semantic uses moved to `state.success`, where they always belonged:
   * "open now" is a status, not a brand colour, and it should stay green if the
   * brand ever stops being.
   *
   * Rename the key to `navy` at the next deliberate refactor. Doing it inside a
   * rebrand would have mixed a value change with a 57-file rename, and made
   * both harder to review.
   */
  cedar: {
    100: '#e6e2d6',
    300: '#6f7fae',
    500: '#24356b',
    700: '#15224e',
    900: '#0b1739',
  },
  surface: {
    // Paper, not screen-white. The three steps are the design's ivory ramp.
    base: '#f7f0e4',
    raised: '#f2ead9',
    sunken: '#efe4cf',
    // Navy. An inverted panel is the masthead and the footer, and it has to
    // carry gold foil and white type at print contrast.
    inverse: '#0b1739',
  },
  /**
   * Functional, and deliberately the least changed thing here.
   *
   * These say "this worked" and "this did not", and a reader should read them
   * before they read the brand. Each is nudged warm enough to sit on ivory
   * rather than white, and no further.
   *
   * `warning` moved furthest, and had to: the old goldenrod sat a few degrees
   * from the new bronze accent, so a "Not settled" block would have read as
   * decoration. Amber keeps it distinguishable from the brand gold.
   */
  state: {
    success: '#3f7250',
    warning: '#b4600f',
    danger: '#a83228',
    info: '#2f5f7f',
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
    // Naskh serif, not the geometric sans that used to sit here. A serif English
    // headline beside a sans Arabic one reads as two brands, not one masthead.
    familyAr: '"Amiri", "Noto Naskh Arabic", serif',
  },
  body: {
    family: '"Manrope", system-ui, -apple-system, sans-serif',
    familyAr: '"Noto Sans Arabic", sans-serif',
  },
  // Reference codes, price marks, and anything that lines up in a column.
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
