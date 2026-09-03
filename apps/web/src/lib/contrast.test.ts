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
 * # It happened again, in the gap this comment used to describe
 *
 * The paragraph here said `ink.300` was "deliberately never used for text" and
 * excluded it on that basis. A Lighthouse run on production found it used for
 * text in five places - the section numerals on the homepage, the rating source
 * label, two pagination ellipses and the expand glyph on the account forms - at
 * 2.11 against `surface.base`, which fails even the large-text threshold.
 *
 * Documenting an assumption is not enforcing it. `ink.300 is only ever an icon`
 * below now checks the source rather than trusting the sentence, which is the
 * same lesson as the paragraph above and had to be learnt twice.
 *
 * # What it does not cover
 *
 * Text over a photograph, which has no fixed ground - the masthead is measured
 * by compositing its gradient over the actual image, and that lives with the
 * component.
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

/**
 * Tokens carrying an opacity modifier, which the pairs above cannot see.
 *
 * `text-cedar-100/50` is not a token - it is a token and a number, composited
 * by the browser - so nothing in the palette test knows it exists. It measured
 * 4.27 on the navy band, which passes for large text and fails for the 11px and
 * 12px uppercase it was actually used on.
 */
describe('cedar on the navy ground, at the alphas the site uses', () => {
  const over = (fg: string, bg: string, alpha: number) => {
    const f = hex(fg)
    const b = hex(bg)
    const mix = f.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)))
    return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('')
  }

  it('is readable at 70 percent, which is what the small type uses', () => {
    const blended = over(colors.cedar[100], colors.cedar[900], 0.7)
    expect(contrast(blended, colors.cedar[900])).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  /** Pins why 50 was replaced, so nobody restores it as a design tweak. */
  it('is not readable at 50 percent', () => {
    const blended = over(colors.cedar[100], colors.cedar[900], 0.5)
    expect(contrast(blended, colors.cedar[900])).toBeLessThan(AA_NORMAL)
  })
})

/**
 * The rule the header paragraph used to only assert.
 *
 * `ink.300` is 2.11 on `surface.base`, so it may tint an icon and must never
 * carry a glyph. Both remaining uses are SVG icons and both carry a `size-`
 * class; a text usage would not. Crude, and it catches the exact five that
 * shipped.
 */
describe('ink.300 is only ever an icon', () => {
  it('is too light for text on any ground the site uses', () => {
    expect(contrast(colors.ink[300], colors.surface.base)).toBeLessThan(AA_NORMAL)
  })

  it('appears in the source only alongside an icon size', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) return walk(full)
        return full.endsWith('.tsx') ? [full] : []
      })

    const offenders: string[] = []

    // Vitest runs with the package as the working directory, so this reaches
    // every component regardless of where this test file sits.
    for (const file of walk(join(process.cwd(), 'src'))) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)

      for (const [index, line] of lines.entries()) {
        if (!line.includes('text-ink-300')) continue
        // An icon carries a `size-` class. A glyph does not.
        if (/\bsize-/.test(line)) continue
        offenders.push(`${file.replace(process.cwd(), '')}:${index + 1}`)
      }
    }

    expect(
      offenders,
      'text-ink-300 without a size- class is text, and ink.300 measures 2.11',
    ).toEqual([])
  })
})
