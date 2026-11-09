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
    expect(cleanHiddenPages(['advertise', 'legal', 'privacy', 7, null])).toEqual(['advertise'])
    expect(cleanHiddenPages(null)).toEqual([])
    expect(cleanHiddenPages('advertise')).toEqual([])
  })

  it('takes the links to hidden pages out of a menu, and nothing else', () => {
    const links = [
      { href: '/about', label: 'About' },
      { href: '/advertise', label: 'Advertise' },
      { href: '/partner', label: 'Partner sign in' },
    ]
    expect(withoutHidden(links, ['advertise']).map((l) => l.href)).toEqual(['/about', '/partner'])
    expect(withoutHidden(links, [])).toEqual(links)
  })

  it('offers every standing page on the Settings page, and no legal page', () => {
    const json = JSON.stringify(Settings.fields)
    expect(json).toContain('"name":"hiddenPages"')
    for (const slug of CONTENT_PAGE_SLUGS) expect(json).toContain(`"value":"${slug}"`)
    expect(json).not.toContain('"value":"privacy"')
    expect(json).not.toContain('"value":"terms"')
  })

  it('rebuilds the site only when the list of hidden pages changes', () => {
    expect(hiddenPagesChanged([], ['advertise'])).toBe(true)
    expect(hiddenPagesChanged(['advertise'], [])).toBe(true)
    expect(hiddenPagesChanged(['faq', 'advertise'], ['advertise', 'faq'])).toBe(false)
    expect(hiddenPagesChanged(undefined, [])).toBe(false)
  })
})
