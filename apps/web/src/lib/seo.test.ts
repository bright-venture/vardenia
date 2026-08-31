import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { alternatesFor } from './seo'

const here = path.dirname(fileURLToPath(import.meta.url))
const LOCALE_DIR = path.resolve(here, '../app/(frontend)/[locale]')

/**
 * Canonical and hreflang.
 *
 * Measured against production before this was written: of every public page,
 * only the three detail pages emitted hreflang, and all but the six standing
 * pages emitted no canonical either. `/directory` and `/ar/directory` were two
 * URLs with nothing linking them, which a search engine reads as duplicates
 * competing for the same terms rather than one page in two languages.
 */

describe('alternatesFor', () => {
  it('points the canonical at the page you are actually on', () => {
    expect(alternatesFor('/directory', 'en').canonical).toBe('/directory')
    expect(alternatesFor('/directory', 'ar').canonical).toBe('/ar/directory')
  })

  /**
   * The Arabic page declaring the English URL as its canonical is the failure
   * that matters most: it tells Google the Arabic edition is a duplicate and
   * should be dropped, which on a bilingual product quietly deletes half the
   * reach.
   */
  it('never gives the Arabic page an English canonical', () => {
    for (const p of ['/', '/directory', '/about', '/legal/terms', '/magazine/issues']) {
      expect(alternatesFor(p, 'ar').canonical, p).toMatch(/^\/ar(\/|$)/)
    }
  })

  it('offers both languages and a default, whichever one is being rendered', () => {
    for (const locale of ['en', 'ar'] as const) {
      const languages = alternatesFor('/faq', locale).languages
      expect(languages, locale).toEqual({
        en: '/faq',
        ar: '/ar/faq',
        'x-default': '/faq',
      })
    }
  })

  /**
   * The case the helper exists for. Built by hand these disagreed: `/ar${path}`
   * gives `/ar/` at the root while the canonical gives `/ar`, so the homepage
   * would name one URL as canonical and a different one as its own Arabic
   * version - the exact confusion hreflang is meant to remove.
   */
  it('agrees with itself at the root', () => {
    const ar = alternatesFor('/', 'ar')
    expect(ar.canonical).toBe('/ar')
    expect(ar.languages?.ar).toBe('/ar')
    expect(alternatesFor('/', 'en').languages?.en).toBe('/')
  })

  it('names the same URL for a language whichever page asks', () => {
    expect(alternatesFor('/about', 'en').languages).toEqual(alternatesFor('/about', 'ar').languages)
  })
})

/**
 * The structural half, so a page added next year cannot quietly skip this.
 *
 * A unit test on the helper proves the helper is right and nothing about
 * whether pages call it. That was the actual defect: `buildMetadata` had
 * correct hreflang all along, and thirteen pages simply never went through it.
 *
 * Pages that are deliberately `noindex` are excluded rather than exempted by
 * name - search engines ignore hreflang on a page they are told not to index,
 * so requiring it there would be noise. The list is derived from the file
 * saying so, not maintained by hand.
 */
describe('every indexable public page declares its alternates', () => {
  const PAGES = [
    'page.tsx',
    '[section]/page.tsx',
    'directory/page.tsx',
    'magazine/page.tsx',
    'magazine/articles/page.tsx',
    'magazine/issues/page.tsx',
    'legal/terms/page.tsx',
    'legal/privacy/page.tsx',
    'about/page.tsx',
    'contact/page.tsx',
    'faq/page.tsx',
    'partner-with-us/page.tsx',
    'advertise/page.tsx',
    'add-your-business/page.tsx',
    'directory/[slug]/page.tsx',
    'magazine/articles/[slug]/page.tsx',
    'magazine/issues/[slug]/page.tsx',
  ]

  const sourceOf = (page: string) => {
    const file = path.join(LOCALE_DIR, page)
    return existsSync(file) ? readFileSync(file, 'utf8') : null
  }

  it.each(PAGES)('%s builds alternates through the shared helper', (page) => {
    const source = sourceOf(page)
    expect(source, `${page} does not exist`).not.toBeNull()

    /**
     * The six standing pages get theirs from `contentRoute`, and the three
     * detail pages from `buildMetadata`. Either counts: what must not happen is
     * a page hand-rolling an `alternates` object, which is how the canonical
     * and the hreflang came to disagree in the first place.
     */
    const viaHelper =
      /alternatesFor\(/.test(source!) ||
      /buildMetadata\(/.test(source!) ||
      /contentRoute\(/.test(source!)

    expect(viaHelper, `${page} must call alternatesFor, buildMetadata or contentRoute`).toBe(true)
  })

  it('has no page writing an alternates object by hand', () => {
    for (const page of PAGES) {
      const source = sourceOf(page)
      if (!source) continue
      expect(/alternates:\s*\{/.test(source), `${page} hand-rolls alternates`).toBe(false)
    }
  })
})
