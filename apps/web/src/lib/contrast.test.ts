import { describe, expect, it } from 'vitest'
import { colors } from '@vardenia/tokens'

/**
 * Every colour that carries text, against every ground it can land on.
 *
 * # Why this exists
 *
 * The 2026 rebrand was checked against `surface.base` and nothing else, and
 * three separate failures shipped:
 *
 *   ink.500        4.31 on the footer, which sits on `surface.raised`
 *   state.warning  3.72 on `gold.100`, the wash behind a TO CONFIRM block
 *   state.success  4.46 on `surface.sunken`, the filter panels
 *
 * All three were found by running a contrast audit against rendered production
 * pages. None was caught by a type, a lint rule, a test or a build, and each
 * one looked completely fine to me on the page I happened to be looking at.
 *
 * The lesson is not "be more careful". It is that a token used on three grounds
 * has to be checked against the darkest of them, and that is arithmetic, which
 * is what a test is for.
 *
 * # What it does not cover
 *
 * Text over a photograph, which has no fixed ground - the masthead is measured
 * by compositing its gradient over the actual image, and that lives with the
 * component. And `ink.300`, which is decoration: it is 1.90 on sunken, is
 * deliberately never used for text, and would fail here if it were listed.
 */

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as number[]

const luminance = (h: string) => {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/**
 * Every light ground a reader meets. `gold.100` is in here because the
 * TO CONFIRM block paints it behind small type, which is exactly the case that
 * was missed.
 */
const GROUNDS = {
  'surface.base': colors.surface.base,
  'surface.raised': colors.surface.raised,
  'surface.sunken': colors.surface.sunken,
  'gold.100': colors.gold[100],
} as const

/** Colours used for text a person reads, at normal size. */
const TEXT_ON_LIGHT = {
  'ink.500': colors.ink[500],
  'ink.700': colors.ink[700],
  'ink.900': colors.ink[900],
  'gold.700': colors.gold[700],
  'state.success': colors.state.success,
  'state.warning': colors.state.warning,
  'state.danger': colors.state.danger,
  'state.info': colors.state.info,
} as const

const AA_NORMAL = 4.5

describe('text on a light ground', () => {
  for (const [fgName, fg] of Object.entries(TEXT_ON_LIGHT)) {
    for (const [bgName, bg] of Object.entries(GROUNDS)) {
      it(`${fgName} on ${bgName} clears AA`, () => {
        const ratio = contrast(fg, bg)
        expect(
          ratio,
          `${fgName} ${fg} on ${bgName} ${bg} is ${ratio.toFixed(2)}, needs ${AA_NORMAL}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL)
      })
    }
  }
})

describe('text on the dark ground', () => {
  const dark = colors.cedar[900]

  it.each([
    ['surface.base', colors.surface.base],
    ['cedar.100', colors.cedar[100]],
    ['gold.300', colors.gold[300]],
    ['ink.300 as a muted mark', colors.ink[300]],
  ])('%s on cedar.900 clears AA', (_name, fg) => {
    expect(contrast(fg, dark)).toBeGreaterThanOrEqual(AA_NORMAL)
  })
})

describe('the gold fill', () => {
  /**
   * The one control filled with the brand colour. `gold.500` behind the ivory
   * ground measures 4.14 and was the original pairing; `gold.700` is what the
   * button and the badges use now.
   */
  it('carries the ivory label at AA', () => {
    expect(contrast(colors.surface.base, colors.gold[700])).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('is why gold.500 is not used as a fill behind text', () => {
    expect(contrast(colors.surface.base, colors.gold[500])).toBeLessThan(AA_NORMAL)
  })
})

/**
 * Not an accessibility rule - a statement that the scale still runs light to
 * dark. A rebrand that accidentally made 300 darker than 500 would leave every
 * component technically passing and visually wrong.
 */
describe('the ink scale', () => {
  it('gets darker as the number rises', () => {
    const steps = [50, 100, 300, 500, 700, 900, 950] as const
    const lums = steps.map((s) => luminance(colors.ink[s]))
    for (let i = 1; i < lums.length; i += 1) {
      expect(lums[i], `ink.${steps[i]} must be darker than ink.${steps[i - 1]}`).toBeLessThan(
        lums[i - 1]!,
      )
    }
  })
})
