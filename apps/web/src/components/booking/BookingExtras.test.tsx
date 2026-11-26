import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { BookingExtras } from './BookingExtras'
import { OptionPrice, RoomsTotal } from '../rooms/RoomPrices'

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={getMessages('en')} timeZone="Asia/Beirut">
      {node}
    </NextIntlClientProvider>,
  ).replace(/[\u2066\u2069]/g, '')

const base = {
  businessId: 5,
  locale: 'en' as const,
  interval: null,
  partySize: 2,
  value: { area: '' as const, packageId: '' },
  onChange: () => {},
}

describe('BookingExtras', () => {
  it('renders no selector when there is nothing to choose', () => {
    const html = wrap(<BookingExtras {...base} config={{ areas: [], packages: [] }} />)
    expect(html).not.toContain('<select')
  })

  it('offers the seating areas of a restaurant', () => {
    const html = wrap(
      <BookingExtras
        {...base}
        value={{ area: 'indoor', packageId: '' }}
        config={{
          areas: [
            { key: 'indoor', setting: 'indoor', smoking: false, label: null },
            { key: 'outdoor-smoking', setting: 'outdoor', smoking: true, label: 'Terrace' },
          ],
          packages: [],
        }}
      />,
    )
    expect(html).toContain('Seating area')
    expect(html).toContain('Indoor')
    expect(html).toContain('Terrace (Outdoor, smoking)')
    expect(html).not.toContain('Package')
  })

  it('offers packages with their price, and the nightly price as the default', () => {
    const html = wrap(
      <BookingExtras
        {...base}
        config={{
          areas: [],
          packages: [
            { id: 'p1', label: 'Weekend', description: null, price: 300, unit: 'per-stay' },
          ],
        }}
      />,
    )
    expect(html).toContain('Nightly price, no package')
    expect(html).toContain('Weekend')
    expect(html).toContain('$300 per stay')
    expect(html).not.toContain('Estimated total')
  })
})

describe('room prices', () => {
  it('shows an option price, or nothing without one', () => {
    expect(wrap(<OptionPrice price={70} />)).toContain('$70 per night')
    expect(wrap(<OptionPrice price={null} />)).toBe('')
  })

  it('renders no total until a room is picked on a date', () => {
    const html = wrap(
      <RoomsTotal businessId={1} date="" nights={2} guests={2} picks={[]} locale="en" />,
    )
    expect(html).not.toContain('Estimated total')
    expect(html).toContain('aria-live="polite"')
  })
})
