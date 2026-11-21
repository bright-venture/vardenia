// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
import type { PublicBrand } from '../../lib/brands'
import { BrandPageView } from './BrandPageView'

vi.mock('next-intl/server', () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: Locale
    namespace: 'brandPage' | 'directory'
  }) => createTranslator({ locale, messages: getMessages(locale), namespace }),
}))

const brand: PublicBrand = {
  name: 'Café Nour',
  slug: 'cafe-nour',
  logo: null,
  description: 'Coffee since 1990.',
  branches: [
    {
      id: 1,
      name: 'Café Nour Hamra',
      slug: 'cafe-nour-hamra',
      address: 'Hamra Street',
      governorate: 'beirut',
      district: null,
      mapUrl: null,
      location: null,
      openingHours: [],
      bookingEnabled: true,
    },
    {
      id: 2,
      name: 'Café Nour Jounieh',
      slug: 'cafe-nour-jounieh',
      address: null,
      governorate: null,
      district: null,
      mapUrl: null,
      location: null,
      openingHours: [],
      bookingEnabled: false,
    },
  ],
}

const render = async (locale: Locale) => {
  const view = await BrandPageView({ brand, locale })
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Beirut">
      {view}
    </NextIntlClientProvider>,
  )
  return root
}

describe('BrandPageView', () => {
  for (const locale of ['en', 'ar'] as const) {
    it(`lists every branch with a link to its listing in ${locale}`, async () => {
      const root = await render(locale)
      expect(root.querySelectorAll('h1')).toHaveLength(1)
      expect(root.querySelector('h1')?.textContent).toBe('Café Nour')
      const hrefs = [...root.querySelectorAll('ul a')].map((a) => a.getAttribute('href'))
      expect(hrefs).toHaveLength(2)
      expect(hrefs[0]).toMatch(/\/directory\/cafe-nour-hamra$/)
      expect(hrefs[1]).toMatch(/\/directory\/cafe-nour-jounieh$/)
    })
  }

  it('says bookings only for the branch that takes them, and shows the address', async () => {
    const root = await render('en')
    const items = root.querySelectorAll('ul > li')
    expect(items[0]!.textContent).toContain('Takes bookings')
    expect(items[0]!.textContent).toContain('Hamra Street')
    expect(items[1]!.textContent).not.toContain('Takes bookings')
  })
})
