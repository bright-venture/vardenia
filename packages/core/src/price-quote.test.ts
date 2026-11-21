import { describe, expect, it } from 'vitest'
import { quoteStay } from './stay'
import { formatUsd, quoteRooms, stayPriceQuote } from './price-quote'

describe('quoteRooms (hotel price snapshot, Task 7)', () => {
  it('sums nights x option price x rooms over every line (multi-room, multi-night)', () => {
    const quote = quoteRooms({
      nights: 3,
      lines: [
        { roomName: 'Deluxe Twin', optionLabel: 'Room only', price: 100, count: 2 },
        { roomName: 'Suite', optionLabel: 'Breakfast included', price: 180.5, count: 1 },
      ],
    })
    expect(quote).toEqual({
      ok: true,
      total: 1141.5,
      currency: 'USD',
      nights: 3,
      lines: [
        { label: '2 x Deluxe Twin (Room only), 3 nights at $100', amount: 600 },
        { label: '1 x Suite (Breakfast included), 3 nights at $180.50', amount: 541.5 },
      ],
    })
  })

  it('one night, one room', () => {
    const quote = quoteRooms({ nights: 1, lines: [{ roomName: 'Single', price: 70, count: 1 }] })
    expect(quote).toMatchObject({ ok: true, total: 70, nights: 1 })
    if (quote.ok) expect(quote.lines[0]!.label).toBe('1 x Single, 1 night at $70')
  })

  it('rounds each line to cents and totals the rounded lines', () => {
    const quote = quoteRooms({
      nights: 3,
      lines: [
        { roomName: 'A', price: 33.33, count: 1 },
        { roomName: 'B', price: 0.1, count: 3 },
      ],
    })
    expect(quote).toMatchObject({ ok: true, total: 100.89 })
    if (quote.ok) expect(quote.lines.map((l) => l.amount)).toEqual([99.99, 0.9])
  })

  it('rounds an uncentable unit price once and uses it for the label and the amount', () => {
    // A legacy price of 33.335: shown as $33.34, so 3 nights cost 3 x 33.34.
    const quote = quoteRooms({ nights: 3, lines: [{ roomName: 'A', price: 33.335, count: 1 }] })
    expect(quote).toMatchObject({
      ok: true,
      total: 100.02,
      lines: [{ label: '1 x A, 3 nights at $33.34', amount: 100.02 }],
    })
  })

  it('a price of 0 is a real price', () => {
    expect(
      quoteRooms({ nights: 2, lines: [{ roomName: 'Free', price: 0, count: 1 }] }),
    ).toMatchObject({ ok: true, total: 0 })
  })

  it.each([null, undefined, Number.NaN, -5])(
    'refuses with no-price, never a zero total, when an option price is %s',
    (price) => {
      expect(quoteRooms({ nights: 2, lines: [{ roomName: 'X', price, count: 1 }] })).toEqual({
        ok: false,
        reason: 'no-price',
      })
    },
  )

  it('stores no partial total: one unpriced line refuses the whole quote', () => {
    expect(
      quoteRooms({
        nights: 2,
        lines: [
          { roomName: 'Priced', price: 100, count: 1 },
          { roomName: 'Unpriced', price: null, count: 1 },
        ],
      }),
    ).toEqual({ ok: false, reason: 'no-price' })
  })

  it.each([
    [0, 1],
    [1.5, 1],
    [Number.NaN, 1],
    [2, 0],
    [2, 1.5],
    [2, -1],
  ])('refuses nights %s with count %s as invalid-input', (nights, count) => {
    expect(quoteRooms({ nights, lines: [{ roomName: 'X', price: 10, count }] })).toEqual({
      ok: false,
      reason: 'invalid-input',
    })
  })

  it('refuses an empty selection as invalid-input', () => {
    expect(quoteRooms({ nights: 2, lines: [] })).toEqual({ ok: false, reason: 'invalid-input' })
  })
})

describe('stayPriceQuote (guest house price snapshot, Task 7)', () => {
  const stay = {
    nightlyPrice: 150,
    includedGuests: 4,
    extraGuestFee: 20,
    maxGuests: 8,
    packages: [
      { id: 'wknd', label: 'Weekend with breakfast', price: 400, unit: 'per-stay' as const },
      { id: 'pp', label: 'Per head', price: 30, unit: 'per-person-per-night' as const },
      { id: 'old', label: 'Old', price: 10, unit: 'per-stay' as const, active: false },
    ],
  }

  it('rounds an uncentable nightly price, fee or package price once, as its label shows', () => {
    const odd = { ...stay, nightlyPrice: 33.335, extraGuestFee: 10.005 }
    const quote = stayPriceQuote(quoteStay({ nights: 3, adults: 5, stay: odd }), odd)
    expect(quote).toMatchObject({
      ok: true,
      lines: [
        { label: 'Nightly price, 3 nights at $33.34', amount: 100.02 },
        { label: 'Extra guests, 1 guest x 3 nights at $10.01', amount: 30.03 },
      ],
      total: 130.05,
    })
    const pkg = {
      ...stay,
      packages: [{ id: 'p', label: 'P', price: 33.335, unit: 'per-night' as const }],
    }
    const withPackage = stayPriceQuote(
      quoteStay({ nights: 3, adults: 2, stay: pkg, packageId: 'p' }),
      pkg,
    )
    expect(withPackage).toMatchObject({
      lines: [{ label: 'P, 3 nights at $33.34', amount: 100.02 }],
    })
  })

  it('nightly price with extra guests', () => {
    const quote = stayPriceQuote(quoteStay({ nights: 2, adults: 5, children: 1, stay }), stay)
    expect(quote).toEqual({
      ok: true,
      total: 380,
      currency: 'USD',
      nights: 2,
      lines: [
        { label: 'Nightly price, 2 nights at $150', amount: 300 },
        { label: 'Extra guests, 2 guests x 2 nights at $20', amount: 80 },
      ],
    })
  })

  it('without extra guests', () => {
    expect(stayPriceQuote(quoteStay({ nights: 3, adults: 2, stay }), stay)).toMatchObject({
      ok: true,
      total: 450,
      lines: [{ label: 'Nightly price, 3 nights at $150', amount: 450 }],
    })
  })

  it('with a per-stay package, named by its label, plus extra guests', () => {
    const quote = stayPriceQuote(quoteStay({ nights: 2, adults: 5, stay, packageId: 'wknd' }), stay)
    expect(quote).toEqual({
      ok: true,
      total: 440,
      currency: 'USD',
      nights: 2,
      lines: [
        { label: 'Weekend with breakfast, per stay', amount: 400 },
        { label: 'Extra guests, 1 guest x 2 nights at $20', amount: 40 },
      ],
    })
  })

  it('with a per-person-per-night package (no extra-guest line)', () => {
    expect(
      stayPriceQuote(quoteStay({ nights: 2, adults: 5, stay, packageId: 'pp' }), stay),
    ).toEqual({
      ok: true,
      total: 300,
      currency: 'USD',
      nights: 2,
      lines: [{ label: 'Per head, 5 guests x 2 nights at $30', amount: 300 }],
    })
  })

  it('passes refusals through', () => {
    expect(
      stayPriceQuote(quoteStay({ nights: 2, adults: 2, stay, packageId: 'old' }), stay),
    ).toEqual({ ok: false, reason: 'inactive-package' })
    expect(
      stayPriceQuote(quoteStay({ nights: 2, adults: 2, stay, packageId: 'nope' }), stay),
    ).toEqual({ ok: false, reason: 'unknown-package' })
    expect(stayPriceQuote(quoteStay({ nights: 2, adults: 2, stay: {} }), {})).toEqual({
      ok: false,
      reason: 'no-price',
    })
  })

  it('reads a localized package label given as an object, falling back to "Package"', () => {
    const local = {
      packages: [{ id: 'a', label: { en: 'Event day' }, price: 50, unit: 'per-night' as const }],
    }
    const quote = stayPriceQuote(
      quoteStay({ nights: 1, adults: 1, stay: local, packageId: 'a' }),
      local,
    )
    if (!quote.ok) throw new Error('expected a quote')
    expect(quote.lines[0]!.label).toBe('Event day, 1 night at $50')
    const blank = { packages: [{ id: 'a', price: 50, unit: 'per-night' as const }] }
    const q2 = stayPriceQuote(
      quoteStay({ nights: 1, adults: 1, stay: blank, packageId: 'a' }),
      blank,
    )
    if (!q2.ok) throw new Error('expected a quote')
    expect(q2.lines[0]!.label).toBe('Package, 1 night at $50')
  })
})

describe('formatUsd', () => {
  it.each([
    [70, '$70'],
    [0, '$0'],
    [180.5, '$180.50'],
    [1234.56, '$1,234.56'],
    [1200, '$1,200'],
  ])('%s -> %s', (value, text) => {
    expect(formatUsd(value)).toBe(text)
  })
})
