// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Pagination } from './Pagination'

vi.mock('../i18n/routing', () => ({
  // `prefetch` is Next's; a plain anchor would print it as an attribute.
  Link: ({ prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a data-prefetch={String(prefetch)} {...props} />
  ),
}))

function links(page: number, totalPages: number) {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(
    <Pagination page={page} totalPages={totalPages} href={(n) => `/stay?where=beirut&page=${n}`} />,
  )
  return [...root.querySelectorAll('a')]
}

describe('Pagination', () => {
  it('draws nothing for a single page', () => {
    expect(links(1, 1)).toHaveLength(0)
  })

  it('shows a window, not every page, and marks the current one', () => {
    const anchors = links(50, 100)
    expect(anchors.map((a) => a.textContent)).toEqual(['1', '48', '49', '50', '51', '52', '100'])
    expect(anchors.find((a) => a.getAttribute('aria-current') === 'page')?.textContent).toBe('50')
  })

  it('keeps the filters on every page address', () => {
    expect(links(1, 3)[1]?.getAttribute('href')).toBe('/stay?where=beirut&page=2')
  })

  /** Crawlers walked every page number of every section (14 November 2026). */
  it('is nofollow and never prefetched', () => {
    for (const a of links(2, 5)) {
      expect(a.getAttribute('rel')).toBe('nofollow')
      expect(a.dataset.prefetch).toBe('false')
    }
  })
})
