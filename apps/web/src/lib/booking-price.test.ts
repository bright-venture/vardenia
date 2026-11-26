import { describe, expect, it } from 'vitest'
import { LOCALES } from '@vardenia/i18n'
import {
  parseRoomsParam,
  priceSnapshotData,
  quoteJson,
  roomQuote,
  stayQuote,
} from './booking-price'
import { toInventory } from './room-booking'
import type { RoomTypeInventory } from './room-availability'

const twin: RoomTypeInventory = {
  id: 3,
  name: 'Deluxe Twin',
  rooms: 5,
  sleepsAdults: 2,
  options: [
    { id: 'ro', breakfast: false, cancellation: 'free', payment: 'at-property', price: 100 },
    {
      id: 'bb',
      breakfast: true,
      cancellation: 'non-refundable',
      payment: 'in-advance',
      price: 130,
    },
    { id: 'np', breakfast: false, cancellation: 'free', payment: 'at-property', price: null },
  ],
}
const suite: RoomTypeInventory = {
  id: 4,
  name: 'Suite',
  rooms: 1,
  sleepsAdults: 2,
  options: [{ id: 's', breakfast: true, cancellation: 'free', payment: 'at-property', price: 0 }],
}

describe('toInventory keeps the option price (Task 7)', () => {
  it('reads a number, and null for anything else', () => {
    const inv = toInventory({
      id: 1,
      options: [
        { id: 'a', price: 99.5 },
        { id: 'b', price: 0 },
        { id: 'c' },
        { id: 'd', price: '12' },
      ],
    })
    expect(inv.options.map((o) => o.price)).toEqual([99.5, 0, null, null])
  })
})

describe('roomQuote', () => {
  it('prices each line with the option chosen, multi-room and multi-night', () => {
    const quote = roomQuote(
      [twin, suite],
      [
        { roomType: 3, count: 2, option: 'bb' },
        { roomType: 4, count: 1, option: 's' },
      ],
      3,
    )
    expect(quote).toMatchObject({ ok: true, total: 780, nights: 3 })
    if (!quote.ok) return
    expect(quote.lines[0]!.label).toContain('2 x Deluxe Twin (Breakfast included')
    expect(quote.lines.map((l) => l.amount)).toEqual([780, 0])
  })

  it('takes the first option when none is named, as the booking service does', () => {
    expect(roomQuote([twin], [{ roomType: 3, count: 1 }], 2)).toMatchObject({
      ok: true,
      total: 200,
    })
  })

  it('stores no snapshot when one chosen option has no price, even with others priced', () => {
    expect(
      roomQuote(
        [twin],
        [
          { roomType: 3, count: 1, option: 'ro' },
          { roomType: 3, count: 1, option: 'np' },
        ],
        2,
      ),
    ).toEqual({ ok: false, reason: 'no-price' })
  })

  it('refuses an unknown room or option as invalid-input', () => {
    expect(roomQuote([twin], [{ roomType: 99, count: 1 }], 2)).toEqual({
      ok: false,
      reason: 'invalid-input',
    })
    expect(roomQuote([twin], [{ roomType: 3, count: 1, option: 'zz' }], 2)).toEqual({
      ok: false,
      reason: 'invalid-input',
    })
  })
})

describe('stayQuote', () => {
  const stay = {
    nightlyPrice: 150,
    includedGuests: 2,
    extraGuestFee: 25,
    packages: [{ id: 'p', label: 'Weekend', price: 500, unit: 'per-stay' as const }],
  }

  it('splits the party like the service (at least one adult) and quotes', () => {
    // 4 people, 1 child, children count: 4 guests, 2 extra.
    expect(stayQuote({ stay, nights: 2, partySize: 4, children: 1 })).toMatchObject({
      ok: true,
      total: 400,
    })
    // 10 children asked in a party of 2: one adult, one child.
    expect(stayQuote({ stay, nights: 1, partySize: 2, children: 10 })).toMatchObject({
      ok: true,
      total: 150,
    })
  })

  it('quotes a package by id', () => {
    expect(stayQuote({ stay, nights: 2, partySize: 2, packageId: 'p' })).toMatchObject({
      ok: true,
      total: 500,
    })
  })

  it('refuses an unknown package, never falling back to the nightly price', () => {
    expect(stayQuote({ stay, nights: 2, partySize: 2, packageId: 'gone' })).toEqual({
      ok: false,
      reason: 'unknown-package',
    })
  })
})

describe('priceSnapshotData', () => {
  it('is the quote, with when it was quoted, as plain copied data', () => {
    const quote = roomQuote([twin], [{ roomType: 3, count: 1, option: 'ro' }], 2)
    if (!quote.ok) throw new Error('expected a quote')
    const at = new Date('2026-11-20T10:00:00.000Z')
    expect(priceSnapshotData(quote, at)).toEqual({
      total: 200,
      currency: 'USD',
      nights: 2,
      lines: [{ label: quote.lines[0]!.label, amount: 200 }],
      quotedAt: '2026-11-20T10:00:00.000Z',
    })
  })
})

describe('quoteJson', () => {
  it('passes a quote through', () => {
    const quote = stayQuote({ stay: { nightlyPrice: 80 }, nights: 2, partySize: 2 })
    expect(quoteJson(quote, 'en')).toEqual({
      ok: true,
      total: 160,
      currency: 'USD',
      nights: 2,
      lines: [{ label: 'Nightly price, 2 nights at $80', amount: 160 }],
    })
  })

  it.each([
    'no-price',
    'invalid-input',
    'unknown-package',
    'inactive-package',
    'below-min-nights',
    'above-max-guests',
  ] as const)('words the refusal %s in every language', (reason) => {
    const english = (quoteJson({ ok: false, reason }, 'en') as { message: string }).message
    for (const locale of LOCALES) {
      const json = quoteJson({ ok: false, reason }, locale)
      expect(json.ok).toBe(false)
      if (json.ok) return
      expect(json.reason).toBe(reason)
      expect(json.message.length, `${reason} ${locale}`).toBeGreaterThan(0)
      expect(json.message).not.toContain(reason)
      if (locale !== 'en') expect(json.message, `${reason} ${locale}`).not.toBe(english)
    }
  })
})

describe('parseRoomsParam', () => {
  it('reads type:count:option lines', () => {
    expect(parseRoomsParam('3:2:bb,4:1')).toEqual([
      { roomType: 3, count: 2, option: 'bb' },
      { roomType: 4, count: 1 },
    ])
  })

  it.each([null, '', 'x', '3', '3:0', '3:-1', '3:1.5', 'a:1', '3:11'])(
    'ignores %o as no selection',
    (raw) => {
      expect(parseRoomsParam(raw)).toBeNull()
    },
  )

  it('caps the number of lines at the most rooms a booking holds', () => {
    const raw = Array.from({ length: 11 }, (_, i) => `${i + 1}:1`).join(',')
    expect(parseRoomsParam(raw)).toBeNull()
  })
})
