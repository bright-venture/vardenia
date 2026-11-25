import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../payload.config', () => ({ default: {} }))

const { cleanHiddenPages, withoutHidden } = await import('./hidden-pages')
const { Settings, hiddenPagesChanged } = await import('../globals/Settings')
const { CONTENT_PAGE_SLUGS } = await import('./pages')

/**
 * Hiding a standing page from the admin's Settings page: only real standing
 * pages can be hidden, a hidden page's links go, and only a change to the list
 * rebuilds the site.
 */

describe('hidden standing pages', () => {
  it('keeps only real standing pages from whatever was stored', () => {
    expect(
      cleanHiddenPages(['add-your-business', 'advertise', 'legal', 'refunds', 7, null]),
    ).toEqual(['add-your-business'])
    expect(cleanHiddenPages(null)).toEqual([])
    expect(cleanHiddenPages('add-your-business')).toEqual([])
  })

  it('takes the links to hidden pages out of a menu, and nothing else', () => {
    const links = [
      { href: '/about', label: 'About' },
      { href: '/add-your-business', label: 'Add your business' },
      { href: '/partner', label: 'Partner sign in' },
    ]
    expect(withoutHidden(links, ['add-your-business']).map((l) => l.href)).toEqual([
      '/about',
      '/partner',
    ])
    expect(withoutHidden(links, [])).toEqual(links)
  })

  it('offers every standing page on the Settings page', () => {
    const json = JSON.stringify(Settings.fields)
    expect(json).toContain('"name":"hiddenPages"')
    for (const slug of CONTENT_PAGE_SLUGS) expect(json).toContain(`"value":"${slug}"`)
  })

  /**
   * Since 11 November 2026 Privacy, Terms and Credits can be hidden, but only
   * as footer links. The pages must stay up: the sign-up form links to Privacy
   * and Terms, and a reader has to be able to read what they agree to. So none
   * of the three pages may consult the hidden list.
   */
  it('hides the legal links from the footer but never the legal pages', () => {
    const json = JSON.stringify(Settings.fields)
    for (const value of ['privacy', 'terms', 'credits'])
      expect(json).toContain(`"value":"${value}"`)
    for (const page of ['legal/privacy', 'legal/terms', 'credits']) {
      const source = readFileSync(
        new URL(`../app/(frontend)/[locale]/${page}/page.tsx`, import.meta.url),
        'utf8',
      )
      expect(source, page).not.toMatch(/hidden-pages|hiddenPages|notFoundIfHidden/)
    }
  })

  it('rebuilds the site only when the list of hidden pages changes', () => {
    expect(hiddenPagesChanged([], ['add-your-business'])).toBe(true)
    expect(hiddenPagesChanged(['add-your-business'], [])).toBe(true)
    expect(hiddenPagesChanged(['faq', 'add-your-business'], ['add-your-business', 'faq'])).toBe(
      false,
    )
    expect(hiddenPagesChanged(undefined, [])).toBe(false)
  })
})
