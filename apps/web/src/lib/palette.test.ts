import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { colors } from '@vardenia/tokens'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '..')

/**
 * Brand colours written out by hand, and whether they still match the tokens.
 *
 * # The bug this exists for
 *
 * `packages/tokens` says changing a hex "touches nothing else". That is true of
 * everything reached through a Tailwind class and false of three things it is
 * not: a gradient stop, an arbitrary box-shadow, and an inline style. Those take
 * a literal, so they silently keep whatever the palette used to be.
 *
 * The 2026 rebrand turned the whole site navy and left behind:
 *
 *   Hero            a green corner wash and a brass glow
 *   ui/Plate        green diagonal stripes on every photograph-less card,
 *                   which at the time was all 308 listings
 *   ListingCard     a hover shadow tinted with the old ink
 *
 * All three looked deliberate. None was caught by types, lint, tests or a build,
 * and the first was only noticed because somebody looked at the homepage.
 *
 * # What this asserts
 *
 * Every rgb/rgba triple and every six-digit hex in the public components must
 * correspond to a colour that is currently in the token set. It does not care
 * which token - a component may legitimately want ink.900 at 6% - only that the
 * value is one the brand still uses.
 *
 * Adding a literal that is not in the palette fails here, which is the point:
 * either use a token value, or add it to the palette deliberately.
 */

/** Every current brand colour, as `r,g,b`. */
const paletteRgb = new Set(
  Object.values(colors)
    .flatMap((group) => Object.values(group as Record<string, string>))
    .map((hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      return `${r},${g},${b}`
    }),
)

/**
 * The public surface only. Payload's admin panel is styled separately and
 * deliberately excluded from the Tailwind content globs, so its colours are not
 * ours to police; the printed QR sheet sets its own ink for a printer.
 */
const EXCLUDED = ['components/admin/', 'app/(payload)/', 'app/qr/']

const files = execFileSync('git', ['ls-files', 'apps/web/src/components', 'apps/web/src/app'], {
  cwd: path.resolve(here, '../../../..'),
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
  .filter((f) => !EXCLUDED.some((prefix) => f.includes(prefix)))

/**
 * Comments are prose, not code, and this file's first run proved why that
 * matters: it flagged four colours that were only mentioned in comments
 * explaining which old values had been replaced. Documenting a superseded hex
 * is exactly the right thing to do and must not fail the build.
 *
 * The `://` guard keeps a URL from swallowing the rest of its line, which would
 * hide a real colour sitting after it.
 */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('hand-written brand colours', () => {
  it('finds files to check, so a broken glob cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('ignores colours that only appear in comments', () => {
    const code = withoutComments(`
      /* the old #c9a227 was replaced */
      // and rgba(27,68,56,0.9) too
      const real = '#9b6a20'
    `)
    expect(code).not.toContain('c9a227')
    expect(code).not.toContain('27,68,56')
    expect(code, 'real code must survive').toContain('9b6a20')
  })

  it('every literal colour is a value the palette still uses', () => {
    const strays: string[] = []

    for (const file of files) {
      const source = withoutComments(readFileSync(path.resolve(here, '../../../..', file), 'utf8'))

      for (const match of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
        const rgb = `${match[1]},${match[2]},${match[3]}`
        if (!paletteRgb.has(rgb)) strays.push(`${file}: rgb(${rgb})`)
      }

      for (const match of source.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
        const hex = `#${match[1]!.toLowerCase()}`
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
        if (!paletteRgb.has(`${r},${g},${b}`)) strays.push(`${file}: ${hex}`)
      }
    }

    expect(strays, `not in the palette:\n  ${strays.join('\n  ')}`).toEqual([])
  })
})
