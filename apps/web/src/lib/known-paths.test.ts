import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SECTION_PATHS } from '@vardenia/core'
import { KNOWN_SEGMENTS, UNMATCHED_PREFIXES, isUnknownTopLevelPath } from './known-paths'

/**
 * The list that turns an invented URL into a real 404.
 *
 * Its danger is rot: a new top-level route that nobody adds to the list becomes
 * a 404 in the middleware, and the page it belongs to is never reached. So the
 * first test reads the app directory and refuses to pass unless the list
 * accounts for everything in it.
 */

const LOCALES = ['en', 'ar'] as const
const APP = path.resolve(__dirname, '../app')

/** Directory names under a route, minus route groups, private folders and files. */
function routeSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('(') && !name.startsWith('_') && !name.startsWith('['))
}

describe('the list matches the routes that exist', () => {
  /**
   * The one that catches a forgotten entry. Every page directory under the
   * locale segment is a path a reader can request, so every one of them has to
   * be known or the middleware will 404 a real page.
   */
  it('knows every page directory under [locale]', () => {
    const dir = path.join(APP, '(frontend)', '[locale]')
    for (const segment of routeSegments(dir)) {
      expect(
        KNOWN_SEGMENTS.has(segment),
        `/${segment} exists as a route but is not in KNOWN_SEGMENTS`,
      ).toBe(true)
    }
  })

  /**
   * The other direction. A segment in the list that no longer has a route is
   * harmless at runtime but means the list is describing a site that changed,
   * which is how the first kind of error creeps in later.
   */
  it('does not claim routes that no longer exist', () => {
    const dir = path.join(APP, '(frontend)', '[locale]')
    const onDisk = new Set([...routeSegments(dir), ...SECTION_PATHS])

    for (const segment of KNOWN_SEGMENTS) {
      expect(onDisk.has(segment), `${segment} is in KNOWN_SEGMENTS but has no route`).toBe(true)
    }
  })

  it('accounts for every top-level directory the middleware does not match', () => {
    const top = routeSegments(APP).filter((name) => name !== 'favicon.ico')
    for (const segment of top) {
      const known = (UNMATCHED_PREFIXES as readonly string[]).includes(segment)
      expect(known, `app/${segment} is neither matched nor listed as unmatched`).toBe(true)
    }
  })

  it('covers all seven sections', () => {
    for (const section of SECTION_PATHS) {
      expect(KNOWN_SEGMENTS.has(section), `${section} is a section but not known`).toBe(true)
    }
    expect(SECTION_PATHS.length).toBe(7)
  })
})

describe('isUnknownTopLevelPath', () => {
  const unknown = (p: string) => isUnknownTopLevelPath(p, LOCALES)

  it('flags an invented single segment', () => {
    for (const p of ['/nonsense', '/zzz', '/wp-admin', '/stayy', '/xmlrpc']) {
      expect(unknown(p), p).toBe(true)
    }
  })

  it('flags it behind a locale prefix too', () => {
    for (const p of ['/ar/nonsense', '/en/zzz']) {
      expect(unknown(p), p).toBe(true)
    }
  })

  it('leaves every real page alone', () => {
    for (const segment of KNOWN_SEGMENTS) {
      expect(unknown(`/${segment}`), `/${segment}`).toBe(false)
      expect(unknown(`/ar/${segment}`), `/ar/${segment}`).toBe(false)
    }
  })

  it('leaves the homepage alone, in both languages', () => {
    for (const p of ['/', '/en', '/ar']) {
      expect(unknown(p), p).toBe(false)
    }
  })

  /**
   * Anything deeper may be a listing slug or an article, and whether those exist
   * is a database question the middleware has no business asking. Those stay
   * soft, which is stated in docs/SECURITY-AUDIT.md rather than hidden.
   */
  it('does not judge a path with more than one segment', () => {
    for (const p of ['/directory/anything', '/ar/magazine/articles/x', '/nonsense/deeper']) {
      expect(unknown(p), p).toBe(false)
    }
  })

  it('ignores anything that looks like a file', () => {
    for (const p of ['/favicon.ico', '/robots.txt', '/sitemap.xml', '/config.php']) {
      expect(unknown(p), p).toBe(false)
    }
  })
})
