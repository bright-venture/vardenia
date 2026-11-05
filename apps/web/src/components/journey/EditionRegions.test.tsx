// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { GOVERNORATES } from '@vardenia/core'
import { EditionRegions } from './EditionRegions'
import { parseFilterState } from '../ListingFilters'

for (const locale of ['en', 'ar'] as const) {
  describe(`magazine edition navigation ${locale}`, () => {
    it('offers all seven actual edition filters, including Matn without inventing a map pin', () => {
      const root = document.createElement('div')
      root.innerHTML = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={getMessages(locale)}
          timeZone="Asia/Beirut"
        >
          <EditionRegions
            title={getMessages(locale).journey.editionRegions}
            arabic={locale === 'ar'}
          />
        </NextIntlClientProvider>,
      )
      const links = [...root.querySelectorAll('a')]
      expect(links).toHaveLength(7)
      expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe(
        getMessages(locale).journey.editionRegions,
      )
      expect(links.map((link) => new URL(link.href).searchParams.get('where'))).toEqual(
        GOVERNORATES.map((g) => g.slug),
      )
      for (const link of links) {
        const where = new URL(link.href).searchParams.get('where')!
        expect(parseFilterState({ where }, []).governorate).toBe(where)
      }
      expect(root.textContent).toContain(locale === 'ar' ? 'كسروان – جبيل' : 'Keserwan–Byblos')
      expect(root.textContent).toContain(locale === 'ar' ? 'المتن' : 'Matn')
      expect(root.querySelector('img')).toBeNull()
    })
  })
}

it.each(['en', 'ar', 'fr', 'es', 'pt', 'ru', 'zh', 'hi', 'bn', 'ur'] as const)(
  'distinguishes edition browsing from featured destinations in %s',
  (locale) => {
    const labels = getMessages(locale).journey
    expect(labels.editionRegions.length).toBeGreaterThan(0)
    expect(labels.featuredDestinations.length).toBeGreaterThan(0)
    expect(labels.editionRegions).not.toBe(labels.featuredDestinations)
  },
)
