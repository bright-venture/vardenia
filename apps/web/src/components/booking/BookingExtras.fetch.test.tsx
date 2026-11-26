// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@vardenia/i18n/messages'
import { BookingExtras } from './BookingExtras'
import { RoomsTotal } from '../rooms/RoomPrices'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const fetchMock = vi.fn()

const mount = async (node: React.ReactNode) => {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={getMessages('en')} timeZone="Asia/Beirut">
        {node}
      </NextIntlClientProvider>,
    )
  })
}
const settle = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
const ok = (body: unknown) => Promise.resolve({ json: () => Promise.resolve(body) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const extrasProps = {
  businessId: 5,
  locale: 'en' as const,
  interval: { start: '2026-12-01T12:00:00.000Z', end: '2026-12-03T10:00:00.000Z' },
  partySize: 3,
  value: { area: 'outdoor' as const, packageId: 'p1' },
  onChange: () => {},
  config: {
    areas: [{ key: 'outdoor' as const, setting: 'outdoor' as const, smoking: false, label: null }],
    packages: [
      { id: 'p1', label: 'Weekend', description: null, price: 300, unit: 'per-stay' as const },
    ],
  },
}

describe('BookingExtras lookups', () => {
  it('asks /booking/availability once, after the wait, with area and package', async () => {
    fetchMock.mockReturnValue(
      ok({ ok: true, quote: { ok: true, total: 450, nights: 2, lines: [] }, areas: [] }),
    )
    await mount(<BookingExtras {...extrasProps} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Working out the price')
    await settle(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0]![0]), 'http://x')
    expect(url.pathname).toBe('/booking/availability')
    expect(url.searchParams.get('business')).toBe('5')
    expect(url.searchParams.get('partySize')).toBe('3')
    expect(url.searchParams.get('area')).toBe('outdoor')
    expect(url.searchParams.get('packageId')).toBe('p1')
    expect(host.textContent).toContain('$450')
    expect(host.textContent).not.toContain('Working out the price')
  })

  it('shows the refusal, not a total, when the slot cannot be booked', async () => {
    fetchMock.mockReturnValue(
      ok({
        ok: false,
        reason: 'at-capacity',
        message: 'Fully booked for those dates.',
        quote: { ok: true, total: 450, nights: 2, lines: [] },
      }),
    )
    await mount(<BookingExtras {...extrasProps} />)
    await settle(400)
    expect(host.textContent).toContain('Fully booked for those dates.')
    expect(host.textContent).not.toContain('$450')
    expect(host.textContent).not.toContain('Estimated total')
  })

  it('stops saying "checking" when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await mount(<BookingExtras {...extrasProps} />)
    await settle(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('Working out the price')
    expect(host.textContent).not.toContain('Estimated total')
  })
})

describe('RoomsTotal lookups', () => {
  const props = {
    businessId: 9,
    date: '2026-12-01',
    nights: 2,
    guests: 2,
    locale: 'en' as const,
  }

  it('sends the selection, once, after the wait', async () => {
    fetchMock.mockReturnValue(ok({ quote: { ok: true, total: 240, nights: 2, lines: [] } }))
    await mount(<RoomsTotal {...props} picks={[{ roomType: 3, option: 'ab', count: 2 }]} />)
    await mount(<RoomsTotal {...props} picks={[{ roomType: 3, option: 'ab', count: 3 }]} />)
    expect(fetchMock).not.toHaveBeenCalled()
    await settle(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0]![0]), 'http://x')
    expect(url.pathname).toBe('/booking/rooms')
    expect(url.searchParams.get('rooms')).toBe('3:3:ab')
    expect(host.textContent).toContain('$240')
  })

  it('clears "checking" on a failed request, and keeps a live region from the start', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await mount(<RoomsTotal {...props} picks={[]} />)
    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull()
    await mount(<RoomsTotal {...props} picks={[{ roomType: 3, option: 'ab', count: 1 }]} />)
    expect(host.textContent).toContain('Working out the price')
    await settle(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('Working out the price')
  })
})
