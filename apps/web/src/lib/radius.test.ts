import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '../../../..')

/**
 * Corner radii, and the fact that the design does not have any.
 *
 * # Why this is a test and not a note in a style guide
 *
 * The 2026 design sets every panel, control, input, badge and image as a plain
 * rectangle with a hairline. That is the print convention the whole thing is
 * built on - a page of square rules with one rounded pill in it reads as a web
 * widget dropped into a magazine.
 *
 * It went in page by page, so for a while the site was half square and half
 * rounded: four redesigned pages next to a rounded "Sign up" button in the
 * header of all of them. Nothing catches that. It is not a type error, not a
 * lint error, and each individual `rounded-md` looks perfectly reasonable in
 * the file it sits in - which is exactly how forty-six of them accumulated.
 *
 * So the rule is asserted where it can fail: adding a radius back fails here,
 * and either the class goes or this list gains a deliberate exception.
 *
 * # rounded-full is not banned, because sometimes round is the meaning
 *
 * A status dot beside "Open now" is a dot. The drag handle on the mobile filter
 * sheet is a handle. Squaring those would be following the rule past the point
 * where it says anything - so `rounded-full` is allowed and the sized radii are
 * not. If a pill-shaped button ever comes back it will use `rounded-full` and
 * slip through; that is a trade for a rule that stays simple enough to keep.
 */

/**
 * The public surface only. Payload's admin panel is styled separately and is
 * deliberately outside the Tailwind content globs, so its corners are not ours;
 * the printed QR sheet is laid out for a printer rather than for this design.
 */
const EXCLUDED = ['components/admin/', 'app/(payload)/', 'app/qr/']

const files = execFileSync('git', ['ls-files', 'apps/web/src'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
  .filter((f) => !EXCLUDED.some((prefix) => f.includes(prefix)))

/**
 * Every `rounded*` class, and then `full` is filtered out below.
 *
 * Written as "match everything, subtract the exception" rather than as a list of
 * the sizes, because the first version listed them - `sm|md|lg|xl` and the
 * per-corner forms - and missed bare `rounded`, which is a real Tailwind class
 * worth 4px. Two of them were sitting in the skeleton loaders and the test
 * passed anyway. A blocklist of the shapes you thought of is not a guard.
 */
const RADIUS = /\brounded(?:-[a-z0-9]+)*\b/g

/** `rounded`, `rounded-md`, `rounded-t-xl` - but never `rounded-full`. */
const isSized = (token: string) => !token.endsWith('-full')

/** Comments explain what was removed and why. Prose must not fail the build. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('corner radii', () => {
  it('finds files to check, so a broken glob cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  const sizedIn = (source: string) => [...source.matchAll(RADIUS)].map((m) => m[0]).filter(isSized)

  it('would catch a radius if one were there', () => {
    expect(sizedIn('inline-flex rounded-md px-4')).toEqual(['rounded-md'])
    expect(sizedIn('mt-2 rounded-t-xl bg-surface-base')).toEqual(['rounded-t-xl'])
  })

  it('catches bare `rounded`, which is the one the first version missed', () => {
    expect(sizedIn('bg-surface-sunken h-4 w-32 rounded')).toEqual(['rounded'])
  })

  it('leaves rounded-full alone, because a dot has to be round', () => {
    expect(sizedIn('h-1.5 w-1.5 rounded-full')).toEqual([])
  })

  it('ignores radii that only appear in comments', () => {
    expect(withoutComments('/* the old rounded-lg went */ const a = 1')).not.toContain('rounded-lg')
  })

  it('no sized radius survives in the public components', () => {
    const strays: string[] = []

    for (const file of files) {
      const source = withoutComments(readFileSync(path.resolve(ROOT, file), 'utf8'))
      for (const token of sizedIn(source)) strays.push(`${file}: ${token}`)
    }

    expect(strays, `the design has no rounded corners:\n  ${strays.join('\n  ')}`).toEqual([])
  })
})
