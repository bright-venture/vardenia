import { describe, expect, it } from 'vitest'
import { SECTIONS } from '@vardenia/core'
import { LOCALES } from '@vardenia/i18n'
import {
  CACHED_SECTION_PATHS,
  CDN_CACHE_VALUE,
  PREFIXED_LOCALES,
  cdnCacheHeaders,
} from './cdn-cache'

/**
 * The directory and section pages, kept by the CDN for a few minutes. The
 * paths are written out (next.config cannot import the packages), so these
 * keep them in step with the real lists.
 */
describe('CDN caching of the browsed pages', () => {
  it('covers every section and every prefixed language', () => {
    expect([...CACHED_SECTION_PATHS].sort()).toEqual(SECTIONS.map((s) => s.path).sort())
    expect([...PREFIXED_LOCALES].sort()).toEqual(LOCALES.filter((l) => l !== 'en').sort())
  })

  it('keeps each address, query included, for minutes and never in the browser', () => {
    const rules = cdnCacheHeaders()
    expect(rules.map((r) => r.source)).toContain('/directory')
    expect(rules.map((r) => r.source)).toContain('/:locale(en|ar|fr|es|pt|ru|zh|hi|bn|ur)/stay')
    for (const rule of rules) {
      const keys = rule.headers.map((h) => h.key)
      expect(keys).toEqual(['Netlify-CDN-Cache-Control', 'Netlify-Vary'])
      expect(keys).not.toContain('Cache-Control')
    }
    expect(CDN_CACHE_VALUE).toMatch(/s-maxage=300/)
    expect(rules[0]!.headers[1]!.value).toBe('query')
  })

  /**
   * English pages reach Netlify as /en/stay, after the proxy's rewrite, and the
   * rules are matched there. Without `en` only the nine other languages were
   * ever cached (16 November 2026).
   */
  it('matches the English pages under the /en address the proxy rewrites them to', () => {
    const sources = cdnCacheHeaders().map((r) => r.source)
    expect(sources).toContain('/stay')
    expect(sources.some((s) => s.startsWith('/:locale(en|') && s.endsWith('/directory'))).toBe(true)
  })

  it('does not reach the account, partner or admin pages', () => {
    const sources = cdnCacheHeaders().map((r) => r.source)
    for (const source of sources) expect(source).not.toMatch(/account|partner|admin|search/)
  })
})
