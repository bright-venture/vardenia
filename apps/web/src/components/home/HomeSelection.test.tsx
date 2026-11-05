// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { HomeListing } from '../../lib/home-listings'
import { HomeSelection } from './HomeSelection'

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'ar' }))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'homeFinish' | 'home') =>
    createTranslator({ locale: state.locale, messages: getMessages(state.locale), namespace }),
}))

// Deliberately synthetic, confined to this test, and never a live listing seed.
const fixture = (id: number): HomeListing => ({
  id,
  slug: `test-place-${id}`,
  name: 'Synthetic test: Le Royal Hotels and Resorts Beirut',
  tagline: 'Test content only, never a real directory recommendation.',
  category: 'hospitality',
  governorate: 'beirut',
  verified: true,
  _status: 'published',
  heroImage: {
    id,
    url: `/test-only/photo-${id}.jpg`,
    mimeType: 'image/jpeg',
  } as HomeListing['heroImage'],
})

for (const locale of ['en', 'ar'] as const) {
  describe(`homepage places in ${locale}`, () => {
    it('renders six localized links, semantic cards and no eager image preloads', async () => {
      state.locale = locale
      const places = Array.from({ length: 6 }, (_, index) => fixture(index + 1))
      if (locale === 'ar') places[0]!.name = 'اسم تجريبي طويل لفندق ومنتجع في بيروت'
      const root = document.createElement('div')
      root.innerHTML = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={getMessages(locale)}
          timeZone="Asia/Beirut"
        >
          {await HomeSelection({ listings: places, locale })}
        </NextIntlClientProvider>,
      )
      const prefix = locale === 'en' ? '' : '/ar'
      expect(root.querySelector('#vd-selection-title')?.textContent).toBe(
        getMessages(locale).homeFinish.placesTitle,
      )
      expect(root.querySelector('section')?.getAttribute('aria-labelledby')).toBe(
        'vd-selection-title',
      )
      expect(root.querySelectorAll('ul > li')).toHaveLength(6)
      expect(root.querySelectorAll('article')).toHaveLength(6)
      expect(root.querySelectorAll(`a[href="${prefix}/directory"]`)).toHaveLength(1)
      expect(root.querySelectorAll(`a[href^="${prefix}/directory/test-place-"]`)).toHaveLength(6)
      expect(root.querySelectorAll('h3[dir="auto"]')).toHaveLength(6)
      expect(root.querySelectorAll('img[loading="lazy"]')).toHaveLength(6)
      expect(root.querySelector('link[rel="preload"]')).toBeNull()
      expect(root.querySelector('a button')).toBeNull()
      expect(root.querySelector('ul')?.className).toContain('sm:grid-cols-2')
      expect(root.querySelector('ul')?.className).toContain('lg:grid-cols-3')
    })

    it('hides an empty, unverified or unphotographed selection without invented filler', async () => {
      expect(await HomeSelection({ listings: [], locale })).toBeNull()
      expect(
        await HomeSelection({ listings: [{ ...fixture(1), verified: false }], locale }),
      ).toBeNull()
      expect(
        await HomeSelection({ listings: [{ ...fixture(1), heroImage: 999 }], locale }),
      ).toBeNull()
    })
  })
}
