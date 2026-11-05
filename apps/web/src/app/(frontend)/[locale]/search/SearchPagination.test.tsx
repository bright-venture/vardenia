import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { SearchPagination, searchPageHref } from './SearchPagination'
function render(page: number, totalPages: number, locale: 'en' | 'ar' = 'en') {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="UTC">
      <SearchPagination
        page={page}
        totalPages={totalPages}
        pageKey="listingsPage"
        searchParams={{ q: 'Byblos', articlesPage: '2' }}
        labelledBy="search-places"
      />
    </NextIntlClientProvider>,
  )
}
describe('search result navigation', () => {
  it('preserves the query, repeated filters, and other collection page', () => {
    const href = searchPageHref(
      { q: 'beach & بحر', articlesPage: '2', listingsPage: '4', amenity: ['wifi', 'pool'] },
      'listingsPage',
      3,
    )
    const params = new URL(href, 'https://example.com').searchParams
    expect(params.get('q')).toBe('beach & بحر')
    expect(params.getAll('amenity')).toEqual(['wifi', 'pool'])
    expect(params.get('articlesPage')).toBe('2')
    expect(params.getAll('listingsPage')).toEqual(['3'])
    expect(searchPageHref({ q: 'Byblos', listingsPage: '2' }, 'listingsPage', 1)).toBe(
      '/search?q=Byblos',
    )
  })
  it('omits navigation for empty or single-page results', () => {
    expect(render(1, 0)).toBe('')
    expect(render(1, 1)).toBe('')
  })
  it('shows valid directions and identifies the current page and result group', () => {
    expect(render(1, 3)).not.toContain('Previous')
    expect(render(1, 3)).toContain('Next')
    expect(render(3, 3)).toContain('Previous')
    expect(render(3, 3)).not.toContain('Next')
    expect(render(2, 3)).toContain('aria-current="page"')
    expect(render(2, 3)).toContain('Page 2 of 3')
    expect(render(2, 3)).toContain('aria-labelledby="search-places"')
  })
  it('uses Arabic links and translations with touch-sized wrapping controls', () => {
    const html = render(2, 3, 'ar')
    expect(html).toContain('href="/ar/search?')
    expect(html).not.toContain('Previous')
    expect(html).not.toContain('Next')
    expect(html).toContain('h-11')
    expect(html).toContain('flex-wrap')
  })
})
