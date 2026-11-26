// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
import { ListingExtras } from './ListingExtras'

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'listingExtras') =>
    createTranslator({ locale: currentLocale, messages: getMessages(currentLocale), namespace }),
}))

let currentLocale: Locale = 'en'

const render = async (
  listing: Parameters<typeof ListingExtras>[0]['listing'],
  locale: Locale = 'en',
) => {
  currentLocale = locale
  const view = await ListingExtras({ listing, locale })
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Beirut">
      {view}
    </NextIntlClientProvider>,
  )
  return root
}

describe('ListingExtras', () => {
  it('renders nothing for a listing with none of the new fields', async () => {
    const root = await render({ subcategories: ['restaurants'], contact: {}, seatingAreas: [] })
    expect(root.innerHTML).toBe('')
  })

  it('draws contact links, only with safe schemes', async () => {
    const root = await render({
      contact: {
        phone: '+961 1 234 567',
        whatsapp: '+961 70 123 456',
        email: 'a@b.com',
        instagram: 'https://instagram.com/x',
        facebook: 'javascript:alert(1)',
      },
    })
    const hrefs = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      'tel:+9611234567',
      'https://wa.me/96170123456',
      'mailto:a@b.com',
      'https://instagram.com/x',
    ])
    expect(root.querySelector('a[href^="https://instagram"]')?.getAttribute('rel')).toContain(
      'noopener',
    )
  })

  it('draws a guest house stay with prices and features', async () => {
    const root = await render({
      subcategories: ['getaways'],
      stay: {
        nightlyPrice: 150,
        extraGuestFee: 20,
        includedGuests: 4,
        minNights: 2,
        packages: [{ id: 'a', label: 'Weekend', price: 300, unit: 'per-stay' }],
      },
      features: { pool: true },
    })
    const text = (root.textContent ?? '').replace(/[\u2066\u2069]/g, '')
    expect(text).toContain('$150 per night')
    expect(text).toContain('Weekend')
    expect(text).toContain('$300 per stay')
    expect(text).toContain('Minimum stay: 2 nights')
    expect(text).toContain('Pool')
  })

  it('draws a hotel facility list and a restaurant seating list, in Arabic too', async () => {
    const hotel = await render(
      { subcategories: ['hotels'], propertyHighlights: ['parking'], facilities: ['pool'] },
      'ar',
    )
    expect(hotel.textContent).toContain('موقف سيارات')
    const restaurant = await render({
      subcategories: ['restaurants'],
      seatingAreas: [{ setting: 'outdoor', smoking: true, tables: 3, label: 'Terrace' }],
    })
    expect(restaurant.textContent).toContain('Terrace')
    expect(restaurant.textContent).toContain('Outdoor, smoking')
  })
})
