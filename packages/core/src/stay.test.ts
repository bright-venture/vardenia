import { describe, expect, it } from 'vitest'
import {
  MAX_STAY_PACKAGES,
  STAY_FEATURES,
  STAY_PACKAGE_UNITS,
  countedGuests,
  featuresProblem,
  quoteStay,
  roundMoney,
  splitParty,
  stayLimitProblem,
  stayProblem,
  type StayConfig,
} from './stay'

/**
 * Guest houses sold as a whole property (Task 6). quoteStay is the price the
 * guest is shown and, from Task 7, the price stored on the booking; every rule
 * is a row in a table below.
 */

const base: StayConfig = {
  nightlyPrice: 100,
  includedGuests: 4,
  maxGuests: 8,
  extraGuestFee: 15,
  childrenCountAsGuests: true,
  minNights: 2,
  packages: [
    { id: 'pn', price: 150, unit: 'per-night', active: true },
    { id: 'ps', price: 500, unit: 'per-stay', active: true },
    { id: 'pp', price: 30, unit: 'per-person-per-night', active: true },
    { id: 'off', price: 10, unit: 'per-stay', active: false },
    { id: 'free', price: 0, unit: 'per-stay' },
  ],
}

describe('roundMoney (half away from zero, two decimals)', () => {
  it.each([
    [1.005, 1.01],
    [1.004, 1],
    [0.125, 0.13],
    [2.675, 2.68],
    [33.335, 33.34],
    [0.1 + 0.2, 0.3],
    [-1.005, -1.01],
    [-0.125, -0.13],
    [0, 0],
    [0.004, 0],
    [0.005, 0.01],
    [1234567.895, 1234567.9],
    [10, 10],
  ])('%s -> %s', (input, expected) => {
    expect(roundMoney(input)).toBe(expected)
  })

  it('never returns negative zero', () => {
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true)
  })
})

describe('splitParty (one rule for the booking service and the guard)', () => {
  it.each([
    [2, 0, { adults: 2, children: 0 }],
    [2, 1, { adults: 1, children: 1 }],
    [2, 5, { adults: 1, children: 1 }],
    [1, 3, { adults: 1, children: 0 }],
    [4, -2, { adults: 4, children: 0 }],
    [4, null, { adults: 4, children: 0 }],
    [4, 1.7, { adults: 3, children: 1 }],
  ])('party %s with %s children -> %j', (party, children, expected) => {
    expect(splitParty(party, children as number | null)).toEqual(expected)
  })
})

describe('countedGuests', () => {
  it.each([
    [2, 0, true, 2],
    [2, 3, true, 5],
    [2, 3, false, 2],
    [2, 3, null, 5],
    [2.7, 1.2, true, 3],
    [-1, 2, true, 2],
  ])('adults %s children %s counted %s -> %s', (adults, children, count, expected) => {
    expect(countedGuests(adults, children, count as boolean | null)).toBe(expected)
  })
})

type Row = {
  name: string
  nights: number
  adults: number
  children?: number
  stay?: StayConfig
  packageId?: string | null
  total?: number
  lines?: { kind: string; unitPrice: number; quantity: number; amount: number }[]
  reason?: string
}

const rows: Row[] = [
  {
    name: 'nightly price, guests included',
    nights: 3,
    adults: 4,
    total: 300,
    lines: [{ kind: 'nightly', unitPrice: 100, quantity: 3, amount: 300 }],
  },
  {
    name: 'extra guests pay per guest per night on top',
    nights: 2,
    adults: 5,
    children: 1,
    total: 260,
    lines: [
      { kind: 'nightly', unitPrice: 100, quantity: 2, amount: 200 },
      { kind: 'extra-guests', unitPrice: 15, quantity: 4, amount: 60 },
    ],
  },
  {
    name: 'children not counted when the owner says so',
    nights: 2,
    adults: 4,
    children: 3,
    stay: { ...base, childrenCountAsGuests: false },
    total: 200,
    lines: [{ kind: 'nightly', unitPrice: 100, quantity: 2, amount: 200 }],
  },
  {
    name: 'children counted by default (null)',
    nights: 2,
    adults: 4,
    children: 1,
    stay: { ...base, childrenCountAsGuests: null },
    total: 230,
  },
  {
    name: 'per-night package replaces the nightly price',
    nights: 2,
    adults: 2,
    packageId: 'pn',
    total: 300,
    lines: [{ kind: 'package', unitPrice: 150, quantity: 2, amount: 300 }],
  },
  {
    name: 'per-stay package is charged once',
    nights: 4,
    adults: 2,
    packageId: 'ps',
    total: 500,
    lines: [{ kind: 'package', unitPrice: 500, quantity: 1, amount: 500 }],
  },
  {
    name: 'per-person-per-night package: price x guests x nights, no extra-guest fee (ruling)',
    nights: 2,
    adults: 6,
    packageId: 'pp',
    total: 360,
    lines: [{ kind: 'package', unitPrice: 30, quantity: 12, amount: 360 }],
  },
  {
    name: 'per-stay package: extra-guest fee still on top',
    nights: 2,
    adults: 5,
    packageId: 'ps',
    total: 530,
    lines: [
      { kind: 'package', unitPrice: 500, quantity: 1, amount: 500 },
      { kind: 'extra-guests', unitPrice: 15, quantity: 2, amount: 30 },
    ],
  },
  {
    name: 'a package priced 0 is free, not unpriced',
    nights: 2,
    adults: 1,
    packageId: 'free',
    total: 0,
  },
  {
    name: 'no extra-guest fee set means no extra line',
    nights: 2,
    adults: 7,
    stay: { ...base, extraGuestFee: null },
    total: 200,
    lines: [{ kind: 'nightly', unitPrice: 100, quantity: 2, amount: 200 }],
  },
  {
    name: 'no included-guest count means every guest is included',
    nights: 2,
    adults: 7,
    stay: { ...base, includedGuests: null },
    total: 200,
  },
  {
    name: 'no max guests: never refused for size',
    nights: 2,
    adults: 40,
    stay: { ...base, maxGuests: null },
    total: 200 + 15 * 36 * 2,
  },
  {
    name: 'minNights missing defaults to 1',
    nights: 1,
    adults: 1,
    stay: { ...base, minNights: null },
    total: 100,
  },
  {
    name: 'rounding: the unit price and each line round half away from zero, then the total from the lines',
    nights: 1,
    adults: 2,
    stay: { nightlyPrice: 33.335, includedGuests: 1, extraGuestFee: 0.125 },
    total: 33.47,
    lines: [
      { kind: 'nightly', unitPrice: 33.34, quantity: 1, amount: 33.34 },
      { kind: 'extra-guests', unitPrice: 0.13, quantity: 1, amount: 0.13 },
    ],
  },
  {
    name: 'rounding: floating point does not leak (0.1 x 3)',
    nights: 3,
    adults: 1,
    stay: { nightlyPrice: 0.1 },
    total: 0.3,
  },
  {
    name: 'rounding: 1.005 per night',
    nights: 1,
    adults: 1,
    stay: { nightlyPrice: 1.005 },
    total: 1.01,
  },
  // Refusals
  { name: 'below min nights', nights: 1, adults: 2, reason: 'below-min-nights' },
  {
    name: 'zero nights',
    nights: 0,
    adults: 2,
    stay: { nightlyPrice: 1 },
    reason: 'below-min-nights',
  },
  {
    name: 'fractional nights',
    nights: 1.5,
    adults: 2,
    stay: { nightlyPrice: 1 },
    reason: 'invalid-input',
  },
  {
    name: 'infinite nights',
    nights: Infinity,
    adults: 2,
    stay: { nightlyPrice: 1 },
    reason: 'invalid-input',
  },
  {
    name: 'negative nights',
    nights: -2,
    adults: 2,
    stay: { nightlyPrice: 1 },
    reason: 'invalid-input',
  },
  { name: 'NaN adults', nights: 2, adults: NaN, reason: 'invalid-input' },
  { name: 'infinite adults', nights: 2, adults: Infinity, reason: 'invalid-input' },
  { name: 'negative adults', nights: 2, adults: -1, reason: 'invalid-input' },
  { name: 'fractional adults', nights: 2, adults: 1.5, reason: 'invalid-input' },
  { name: 'negative children', nights: 2, adults: 2, children: -1, reason: 'invalid-input' },
  { name: 'fractional children', nights: 2, adults: 2, children: 0.5, reason: 'invalid-input' },
  { name: 'NaN children', nights: 2, adults: 2, children: NaN, reason: 'invalid-input' },
  { name: 'above max guests', nights: 2, adults: 8, children: 1, reason: 'above-max-guests' },
  {
    name: 'exactly max guests is fine',
    nights: 2,
    adults: 8,
    total: 200 + 15 * 4 * 2,
  },
  {
    name: 'children not counted are not counted against max either',
    nights: 2,
    adults: 8,
    children: 2,
    stay: { ...base, childrenCountAsGuests: false },
    total: 320,
  },
  { name: 'unknown package', nights: 2, adults: 2, packageId: 'nope', reason: 'unknown-package' },
  { name: 'inactive package', nights: 2, adults: 2, packageId: 'off', reason: 'inactive-package' },
  {
    name: 'no nightly price and no package',
    nights: 2,
    adults: 2,
    stay: { ...base, nightlyPrice: null },
    reason: 'no-price',
  },
  {
    name: 'min nights checked before the package',
    nights: 1,
    adults: 2,
    packageId: 'nope',
    reason: 'below-min-nights',
  },
]

describe('quoteStay', () => {
  it.each(rows.map((row) => [row.name, row] as const))('%s', (_name, row) => {
    const quote = quoteStay({
      nights: row.nights,
      adults: row.adults,
      children: row.children ?? 0,
      stay: row.stay ?? base,
      packageId: row.packageId ?? null,
    })
    if (row.reason) {
      expect(quote).toEqual({ ok: false, reason: row.reason })
      return
    }
    expect(quote.ok).toBe(true)
    if (!quote.ok) return
    expect(quote.currency).toBe('USD')
    expect(quote.total).toBe(row.total)
    if (row.lines) {
      expect(
        quote.lines.map(({ kind, unitPrice, quantity, amount }) => ({
          kind,
          unitPrice,
          quantity,
          amount,
        })),
      ).toEqual(row.lines)
    }
    // The total is always the sum of the rounded lines.
    expect(quote.total).toBe(roundMoney(quote.lines.reduce((sum, line) => sum + line.amount, 0)))
  })

  it('names the package on its line and reports nights and guests', () => {
    const quote = quoteStay({ nights: 2, adults: 5, children: 0, stay: base, packageId: 'pn' })
    expect(quote).toMatchObject({
      ok: true,
      nights: 2,
      guests: 5,
      extraGuests: 1,
      lines: [{ kind: 'package', packageId: 'pn', unit: 'per-night' }, { kind: 'extra-guests' }],
    })
  })

  it('treats a missing stay config as unpriced', () => {
    expect(quoteStay({ nights: 1, adults: 1, stay: null })).toEqual({
      ok: false,
      reason: 'no-price',
    })
  })
})

describe('stayLimitProblem (what the booking service enforces)', () => {
  it.each([
    [1, 2, 0, 'below-min-nights'],
    [2, 9, 0, 'above-max-guests'],
    [2, 8, 1, 'above-max-guests'],
    [2, 8, 0, null],
    [5, 1, 0, null],
  ])('%s nights, %s adults, %s children -> %s', (nights, adults, children, expected) => {
    expect(stayLimitProblem({ nights, adults, children, stay: base })).toBe(expected)
  })

  it('holds with no price set: limits do not depend on pricing', () => {
    expect(
      stayLimitProblem({ nights: 1, adults: 1, stay: { minNights: 3, nightlyPrice: null } }),
    ).toBe('below-min-nights')
    expect(stayLimitProblem({ nights: 1, adults: 1, stay: null })).toBeNull()
  })
})

describe('stayProblem (getaways only, and consistent)', () => {
  const getaway = ['getaways']
  it('accepts a full config on a getaway', () => {
    expect(stayProblem({ subcategories: getaway, stay: base })).toBeNull()
  })
  it.each([[['restaurants']], [['hotels']], [[]], [null]])(
    'refuses a priced stay on %j',
    (subcategories) => {
      expect(stayProblem({ subcategories, stay: { nightlyPrice: 10 } })).toMatch(/guest houses/i)
    },
  )
  it('lets other kinds keep the defaults Payload fills in', () => {
    expect(
      stayProblem({
        subcategories: ['restaurants'],
        stay: {
          extraGuestFee: 0,
          childrenCountAsGuests: true,
          minNights: 1,
          packages: [],
          nightlyPrice: null,
        },
      }),
    ).toBeNull()
  })
  it.each([
    [{ includedGuests: 2 }],
    [{ maxGuests: 2 }],
    [{ extraGuestFee: 5 }],
    [{ minNights: 2 }],
    [{ childrenCountAsGuests: false }],
    [{ packages: [{ price: 1, unit: 'per-stay' as const }] }],
  ])('counts %j as content on a restaurant', (stay) => {
    expect(stayProblem({ subcategories: ['restaurants'], stay })).not.toBeNull()
  })
  it('refuses maxGuests below includedGuests', () => {
    expect(
      stayProblem({ subcategories: getaway, stay: { includedGuests: 4, maxGuests: 3 } }),
    ).toMatch(/maximum/i)
  })
  it('refuses an extra-guest fee without an included-guest count', () => {
    expect(stayProblem({ subcategories: getaway, stay: { extraGuestFee: 10 } })).toMatch(
      /included/i,
    )
  })
  it(`refuses more than ${MAX_STAY_PACKAGES} packages`, () => {
    const packages = Array.from({ length: MAX_STAY_PACKAGES + 1 }, () => ({
      price: 1,
      unit: 'per-stay' as const,
    }))
    expect(stayProblem({ subcategories: getaway, stay: { packages } })).toMatch(/10/)
  })
})

describe('featuresProblem', () => {
  it('lists the six features', () => {
    expect([...STAY_FEATURES]).toEqual([
      'musicAllowed',
      'eventsHosted',
      'partiesAllowed',
      'gardenAccess',
      'barbecue',
      'pool',
    ])
    expect([...STAY_PACKAGE_UNITS]).toEqual(['per-night', 'per-stay', 'per-person-per-night'])
  })
  it('accepts features on a getaway and an empty group anywhere', () => {
    expect(featuresProblem({ subcategories: ['getaways'], features: { pool: true } })).toBeNull()
    expect(
      featuresProblem({ subcategories: ['hotels'], features: { pool: false, barbecue: null } }),
    ).toBeNull()
  })
  it('refuses a ticked feature on a hotel or restaurant', () => {
    expect(featuresProblem({ subcategories: ['hotels'], features: { pool: true } })).toMatch(
      /guest houses/i,
    )
    expect(
      featuresProblem({ subcategories: ['restaurants'], features: { musicAllowed: true } }),
    ).not.toBeNull()
  })
})
