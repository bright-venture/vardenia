import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { PlaceSubmission } from '@vardenia/core'

const locks = vi.hoisted(() => [] as string[])
vi.mock('./partner-lock', () => ({
  advisoryLock: async (_req: unknown, key: string) => {
    locks.push(key)
  },
}))
vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))

// The transaction helper is replaced by one with the same contract: writes made
// with its `req` are undone when the work throws, and a thrown error is passed on.
type Row = Record<string, unknown> & { id: number; collection: string }
const store = vi.hoisted(() => ({ rows: [] as unknown[], tx: [] as unknown[] }))
vi.mock('./branches', () => ({
  runInTransaction: async (
    _payload: unknown,
    fn: (req: { transactionID: string }) => Promise<unknown>,
  ) => {
    const before = store.rows.length
    try {
      return await fn({ transactionID: 'tx' })
    } catch (error) {
      store.rows.length = before
      throw error
    }
  },
}))

import { reportError } from './report'
import { statusForOutcome } from './place-submission-request'
import {
  hashSessionToken,
  isListingNumberTaken,
  issuePlaces,
  listNumbersFor,
  openIssues,
  MAX_OPEN_STARTS_PER_EMAIL,
  startPlaceSubmission,
} from './place-submission'

/**
 * The one public door that writes a listing. It writes with overrideAccess, so
 * these tests pin what it is willing to write and what it refuses first.
 */

const input = (over: Partial<PlaceSubmission> = {}): PlaceSubmission =>
  ({
    name: 'Cafe Nour',
    tagline: 'Good coffee',
    description: 'First line.\n\nSecond line.',
    kind: 'cafes',
    governorate: 'beirut',
    city: 'beirut',
    address: 'Hamra St',
    acceptsWhish: true,
    publicPhone: '+9611',
    instagram: 'https://instagram.com/cafenour',
    facebook: undefined,
    ownerName: 'Nour',
    ownerEmail: 'n@x.com',
    ownerPhone: '+9617',
    pageTemplate: 'a',
    layout: 'full-page',
    issue: 7,
    listingNumber: 12,
    locale: 'ar',
    ...over,
  }) as PlaceSubmission

interface Stub {
  find: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  findGlobal: ReturnType<typeof vi.fn>
  findByID: ReturnType<typeof vi.fn>
}

/** Slots of a full-page slot, numbered n on page p. */
const page = (number: number, p: number, layout = 'full-page') => ({
  number,
  page: p,
  position: null,
  layout,
})

/**
 * Issue 7's slots (copied from its template). The beirut block is numbers
 * 10-20: 9 sits before it, 10-11 are the two halves of page 10, 12-20 are full
 * pages 11-19, and 21 (full page) and 22-25 (quarters of page 21) sit after it.
 */
const defaultSlots = [
  page(9, 9),
  { number: 10, page: 10, position: 1, layout: 'half-page' },
  { number: 11, page: 10, position: 2, layout: 'half-page' },
  ...Array.from({ length: 9 }, (_, i) => page(12 + i, 11 + i)),
  page(21, 20),
  ...[1, 2, 3, 4].map((position) => ({
    number: 21 + position,
    page: 21,
    position,
    layout: 'quarter-page',
  })),
]

/** A payload with one beirut range 10-20 in issue 7 and number 11 taken. */
function stub(
  opts: {
    range?: boolean
    /** The ranges every listing-ranges query answers; default: beirut 10-20 in issue 7. */
    ranges?: unknown[]
    /** Coverage fields of issue 7; default: none (All Lebanon). */
    issue?: Record<string, unknown>
    /** The issue's price table; default: full page at 500, half page at 300. */
    layouts?: unknown[] | null
    /** The issue's slots; default: defaultSlots. null for a legacy issue. */
    slots?: unknown[] | null
    /** The numbers listings hold in the block; default: [11]. */
    held?: number[]
    /** Who holds them, for the per-place counts; default: the held numbers, in beirut. */
    holders?: { listingNumber: number; governorate: string; city?: string | null }[]
    /** What an `issues` find answers; default: issue 7. */
    issues?: unknown[]
    /** Issue 7 does not exist. */
    noIssue?: boolean
    holdMinutes?: number
    /** One error per business create, in order; creates after the last succeed. */
    listingErrors?: unknown[]
    failListing?: unknown
    failSession?: unknown
    failUpdate?: unknown
  } = {},
): Stub & Payload {
  store.rows = []
  const listingErrors = [...(opts.listingErrors ?? [])]
  let nextId = 555
  const held = opts.held ?? [11]
  const find = vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === 'listing-ranges') {
      return {
        docs:
          opts.range === false
            ? []
            : (opts.ranges ?? [
                { issue: { id: 7, title: 'Summer' }, governorate: 'beirut', from: 10, to: 20 },
              ]),
      }
    }
    if (collection === 'businesses')
      return {
        docs:
          opts.holders ??
          held.map((listingNumber) => ({ listingNumber, governorate: 'beirut', city: null })),
      }
    if (collection === 'issues')
      return { docs: opts.issues ?? [{ id: 7, title: 'Summer', ...opts.issue }] }
    return { docs: [] }
  })
  const create = vi.fn(
    async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      if (collection === 'businesses') {
        if (opts.failListing) throw opts.failListing
        const next = listingErrors.shift()
        if (next) throw next
      } else if (opts.failSession) {
        throw opts.failSession
      }
      const row = { id: nextId++, collection, data: structuredClone(data) }
      store.rows.push(row)
      return { id: row.id }
    },
  )
  const defaultLayouts = [
    { layout: 'full-page', offered: true, price: 500 },
    { layout: 'half-page', offered: true, price: 300 },
  ]
  const findByID = vi.fn(async () =>
    opts.noIssue
      ? null
      : {
          id: 7,
          title: 'Summer',
          ...opts.issue,
          slots: opts.slots === undefined ? defaultSlots : opts.slots,
          layouts: opts.layouts === undefined ? defaultLayouts : opts.layouts,
        },
  )
  const update = vi.fn(async () => {
    if (opts.failUpdate) throw opts.failUpdate
    return { id: 555 }
  })
  const findGlobal = vi.fn(async () => ({
    magazinePlaces: opts.holdMinutes ? { holdMinutes: opts.holdMinutes } : {},
  }))
  return { find, create, update, findGlobal, findByID } as unknown as Stub & Payload
}

const created = (s: Stub, collection: string) =>
  s.create.mock.calls.map((c) => c[0]).filter((a) => a.collection === collection)

const stored = (collection: string) =>
  (store.rows as Row[]).filter((row) => row.collection === collection)

describe('listNumbersFor', () => {
  it('returns the block, what is taken, and the free slots of each offered layout in it', async () => {
    const s = stub()
    const out = await listNumbersFor(s, 7, { governorate: 'beirut' })
    expect(out).toEqual([
      {
        issueId: 7,
        issueTitle: 'Summer',
        coverage: 'all-lebanon',
        from: 10,
        to: 20,
        taken: [11],
        currency: 'USD',
        layouts: [
          {
            layout: 'full-page',
            price: 500,
            downpaymentAmount: 250,
            // 9 and 21 are full pages too, but outside the block.
            slots: Array.from({ length: 9 }, (_, i) => ({
              number: 12 + i,
              page: 11 + i,
              position: null,
              lastPage: 11 + i,
            })),
            free: 9,
          },
          {
            layout: 'half-page',
            price: 300,
            downpaymentAmount: 150,
            // 11 is held: only its other half is free.
            slots: [{ number: 10, page: 10, position: 1, lastPage: 10 }],
            free: 1,
          },
        ],
      },
    ])
    const businessQuery = s.find.mock.calls
      .map((c) => c[0])
      .find((a) => a.collection === 'businesses')
    expect(businessQuery.select).toEqual({ listingNumber: true })
    expect(businessQuery.overrideAccess).toBe(true)
  })

  it('gives a spread its second page as lastPage', async () => {
    const out = await listNumbersFor(
      stub({
        slots: [{ number: 12, page: 62, position: null, layout: 'full-spread' }],
        layouts: [{ layout: 'full-spread', offered: true, price: 900 }],
      }),
      7,
      { governorate: 'beirut' },
    )
    expect(out[0]!.layouts).toEqual([
      expect.objectContaining({
        layout: 'full-spread',
        slots: [{ number: 12, page: 62, position: null, lastPage: 63 }],
        free: 1,
      }),
    ])
  })

  it('reports a layout whose slots in the block are all held with free: 0 and no slots', async () => {
    const out = await listNumbersFor(stub({ held: [10, 11] }), 7, { governorate: 'beirut' })
    expect(out[0]!.layouts.find((l) => l.layout === 'half-page')).toEqual({
      layout: 'half-page',
      price: 300,
      downpaymentAmount: 150,
      slots: [],
      free: 0,
    })
  })

  it('leaves out an offered layout with no slot in this block (quarters sit after it)', async () => {
    const out = await listNumbersFor(
      stub({ layouts: [{ layout: 'quarter-page', offered: true, price: 100 }] }),
      7,
      { governorate: 'beirut' },
    )
    expect(out[0]!.layouts).toEqual([])
  })

  it('lists no layout that is not offered, has no price, or has no slot in the issue', async () => {
    const s = stub({
      layouts: [
        { layout: 'full-page', offered: false, price: 500 },
        { layout: 'half-page', offered: true, price: null },
        { layout: 'three-third', offered: true, price: 200 },
      ],
    })
    const out = await listNumbersFor(s, 7, { governorate: 'beirut' })
    expect(out[0]!.layouts).toEqual([])
  })

  it('reads the issue with overrideAccess and never names an owner', async () => {
    const s = stub()
    const out = await listNumbersFor(s, 7, { governorate: 'beirut' })
    expect(JSON.stringify(out)).not.toMatch(/owner|email|name/i)
    expect(s.findByID.mock.calls[0]![0]).toMatchObject({
      collection: 'issues',
      id: 7,
      overrideAccess: true,
    })
  })

  it('offers no layouts for a legacy issue without slots, keeping its numbers', async () => {
    const out = await listNumbersFor(stub({ slots: null }), 7, { governorate: 'beirut' })
    expect(out).toEqual([
      {
        issueId: 7,
        issueTitle: 'Summer',
        coverage: 'all-lebanon',
        from: 10,
        to: 20,
        taken: [11],
        currency: 'USD',
        layouts: [],
      },
    ])
  })

  it('returns nothing for a governorate with no range', async () => {
    expect(await listNumbersFor(stub({ range: false }), 7, { governorate: 'matn' })).toEqual([])
  })
})

describe('startPlaceSubmission', () => {
  it('refuses a number outside the range, writing nothing', async () => {
    const s = stub()
    const out = await startPlaceSubmission({ payload: s, input: input({ listingNumber: 99 }) })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a missing layout, writing nothing', async () => {
    const s = stub()
    const out = await startPlaceSubmission({
      payload: s,
      input: input({ layout: undefined as never }),
    })
    expect(out).toMatchObject({ ok: false, code: 'layout-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it.each([
    ['not offered', [{ layout: 'full-page', offered: false, price: 500 }], undefined],
    ['unpriced', [{ layout: 'full-page', offered: true, price: null }], undefined],
    ['absent from the price table', [{ layout: 'half-page', offered: true, price: 3 }], undefined],
    ['the issue has no table', null, undefined],
    [
      'without a slot in the issue',
      [{ layout: 'full-page', offered: true, price: 500 }],
      [{ number: 12, page: 11, position: 1, layout: 'half-page' }],
    ],
    ['in a legacy issue without slots', undefined, null],
  ])('refuses a layout that is %s, with the standard message', async (_n, layouts, slots) => {
    const s = stub({ layouts, slots })
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toEqual({
      ok: false,
      code: 'layout-unavailable',
      message: 'That layout is not available. Please choose another.',
    })
    expect(s.create).not.toHaveBeenCalled()
  })

  /**
   * The layout is checked before the number (QA run 26 November 2026, LP-ST2):
   * a layout that is not on sale is refused as such, whatever number came
   * with it, so the owner is told to choose another size, not another number.
   */
  it('refuses a switched-off layout as a layout problem even with an out-of-block number', async () => {
    const s = stub({ layouts: [{ layout: 'full-page', offered: false, price: 500 }] })
    const out = await startPlaceSubmission({ payload: s, input: input({ listingNumber: 99 }) })
    expect(out).toMatchObject({ ok: false, code: 'layout-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a number in the block that is a slot of another layout, writing nothing', async () => {
    const s = stub()
    // 10 is in the block (10-20) but is half of page 10, not a full page.
    const out = await startPlaceSubmission({ payload: s, input: input({ listingNumber: 10 }) })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a slot of the layout outside the governorate block, writing nothing', async () => {
    const s = stub()
    // 21 is a full page of the issue, but after beirut's block.
    const out = await startPlaceSubmission({ payload: s, input: input({ listingNumber: 21 }) })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a number in the block that is no slot of the issue at all', async () => {
    const s = stub({ slots: defaultSlots.filter((slot) => slot.number !== 15) })
    const out = await startPlaceSubmission({ payload: s, input: input({ listingNumber: 15 }) })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('reads the slots and prices from the issue at start time, with overrideAccess', async () => {
    const s = stub()
    await startPlaceSubmission({ payload: s, input: input() })
    expect(s.findByID.mock.calls[0]![0]).toMatchObject({
      collection: 'issues',
      id: 7,
      overrideAccess: true,
    })
  })

  it('creates the draft with the layout and the layout price snapshot (not Settings), and answers with it', async () => {
    const s = stub()
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toMatchObject({ ok: true, price: 500, downpaymentAmount: 250, currency: 'USD' })
    const [listing] = created(s, 'businesses')
    expect(listing.data.pageLayout).toBe('full-page')
    expect(listing.data.listingNumber).toBe(12)
    expect(listing.data.submission.payment).toEqual({ price: 500, downpaymentAmount: 250 })
    // The follow-up write must not touch the layout (it is set once).
    expect(s.update.mock.calls[0]![0].data).not.toHaveProperty('pageLayout')
  })

  it('starts a half-page slot of the block at the half-page price', async () => {
    const s = stub()
    const out = await startPlaceSubmission({
      payload: s,
      input: input({ layout: 'half-page', listingNumber: 10 }),
    })
    expect(out).toMatchObject({ ok: true, price: 300, downpaymentAmount: 150 })
    expect(created(s, 'businesses')[0].data.pageLayout).toBe('half-page')
  })

  it('ignores a price or template sent by the browser', async () => {
    const s = stub()
    await startPlaceSubmission({
      payload: s,
      input: {
        ...input(),
        price: 1,
        downpaymentAmount: 1,
        template: 'x',
      } as unknown as PlaceSubmission,
    })
    const [listing] = created(s, 'businesses')
    expect(listing.data.submission.payment).toEqual({ price: 500, downpaymentAmount: 250 })
    expect(listing.data).not.toHaveProperty('price')
    expect(listing.data).not.toHaveProperty('template')
  })

  it('refuses a slot of the layout another listing holds, writing nothing', async () => {
    const s = stub()
    const out = await startPlaceSubmission({
      payload: s,
      input: input({ layout: 'half-page', listingNumber: 11 }),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a governorate with no range', async () => {
    const s = stub({ range: false })
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toMatchObject({ ok: false, code: 'no-range' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses an unknown kind even if the schema was bypassed', async () => {
    for (const kind of ['spaceport', 'nonsense']) {
      const s = stub()
      const out = await startPlaceSubmission({
        payload: s,
        input: input({ kind: kind as never }),
      })
      expect(out).toMatchObject({ ok: false, code: 'kind-unavailable' })
      expect(s.create).not.toHaveBeenCalled()
    }
  })

  it('creates one hidden incomplete draft, one session, once', async () => {
    const s = stub()
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toMatchObject({ ok: true, listingId: 555, reference: 'VD-555' })
    expect(created(s, 'businesses')).toHaveLength(1)
    expect(created(s, 'place-upload-sessions')).toHaveLength(1)
    expect(stored('businesses')).toHaveLength(1)
    expect(stored('place-upload-sessions')).toHaveLength(1)
    expect(s.update).toHaveBeenCalledTimes(1)

    const [listing] = created(s, 'businesses')
    expect(listing.overrideAccess).toBe(true)
    expect(listing.locale).toBe('ar')
    expect(listing.req).toEqual({ transactionID: 'tx' })
    expect(listing.context).toEqual({ skipQrGeneration: true, skipAutoTranslate: true })
    // Never public, never pending staff work.
    expect(listing.data._status).toBe('draft')
    expect(listing.data.submission.status).toBe('incomplete')
    // Not yet submitted: submittedAt is set when the owner finishes.
    expect(listing.data.submission).not.toHaveProperty('submittedAt')
  })

  it('writes only the allow-list; smuggled fields never reach the record', async () => {
    const s = stub()
    await startPlaceSubmission({
      payload: s,
      input: {
        ...input(),
        tier: 'gold',
        _status: 'published',
        verified: true,
        qrCode: 'x',
        commission: 50,
        slug: 'mine',
        salesOwner: 1,
        internalNotes: 'hi',
        contractEndsAt: '2099-01-01',
        payment: { status: 'paid' },
        heroImage: 9,
        logo: 9,
        reference: 'VD-1',
        submissionStatus: 'approved',
      } as unknown as PlaceSubmission,
    })
    const [listing] = created(s, 'businesses')
    expect(Object.keys(listing.data).sort()).toEqual(
      [
        'name',
        'tagline',
        'description',
        'category',
        'subcategories',
        'governorate',
        'city',
        'address',
        'payments',
        'issue',
        'listingNumber',
        'pageLayout',
        '_status',
        'contact',
        'submission',
      ].sort(),
    )
    expect(Object.keys(listing.data.submission).sort()).toEqual([
      'ownerEmail',
      'ownerName',
      'ownerPhone',
      'pageTemplate',
      'payment',
      'status',
    ])
    expect(listing.data).not.toHaveProperty('tier')
    expect(listing.data.description.root.children).toHaveLength(2)
    // Category comes from the one kind; payments hold only Whish.
    expect(listing.data.category).toBe('food-and-beverage')
    expect(listing.data.subcategories).toEqual(['cafes'])
    // An All Lebanon issue (the default): the governorate only, no city.
    expect(listing.data.governorate).toBe('beirut')
    expect(listing.data.city).toBeUndefined()
    expect(listing.data.payments).toEqual({ cash: false, card: false, whish: true, omt: false })
    expect(listing.data.contact).toEqual({
      phone: '+9611',
      instagram: 'https://instagram.com/cafenour',
      facebook: undefined,
    })
    // The follow-up write carries the reference and nothing of the owner's.
    const write = s.update.mock.calls[0]![0]
    expect(write.data.submission).toEqual({ reference: 'VD-555' })
    for (const key of ['tier', '_status', 'payment', 'contractEndsAt', 'slug']) {
      expect(write.data).not.toHaveProperty(key)
    }
  })

  it('leaves the tier to its default (silver): it is never set', async () => {
    const s = stub()
    await startPlaceSubmission({
      payload: s,
      input: { ...input(), tier: 'platinum' } as unknown as PlaceSubmission,
    })
    expect(JSON.stringify(created(s, 'businesses')[0].data)).not.toContain('platinum')
    expect(created(s, 'businesses')[0].data).not.toHaveProperty('tier')
  })

  it('stores a payments.whish of false when the box is not ticked', async () => {
    const s = stub()
    await startPlaceSubmission({ payload: s, input: input({ acceptsWhish: false }) })
    expect(created(s, 'businesses')[0].data.payments.whish).toBe(false)
  })

  it('returns the plain token once and stores only its hash', async () => {
    const s = stub()
    const out = await startPlaceSubmission({ payload: s, input: input() })
    if (!out.ok) throw new Error('expected ok')
    expect(out.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [session] = created(s, 'place-upload-sessions')
    expect(session.overrideAccess).toBe(true)
    expect(session.data.tokenHash).toBe(hashSessionToken(out.sessionToken))
    expect(session.data.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(session.data).toMatchObject({
      business: 555,
      logoReceived: false,
      heroReceived: false,
    })
    // The plain token is nowhere in anything written, or in the reference.
    expect(JSON.stringify(store.rows)).not.toContain(out.sessionToken)
    expect(JSON.stringify(s.update.mock.calls)).not.toContain(out.sessionToken)
    expect(out.reference).not.toContain(out.sessionToken)
  })

  it('makes a different token for every start', async () => {
    const a = await startPlaceSubmission({ payload: stub(), input: input() })
    const b = await startPlaceSubmission({ payload: stub(), input: input() })
    expect(a.ok && b.ok && a.sessionToken !== b.sessionToken).toBe(true)
  })

  it('sets the hard cap of the session to 24 hours after the start, whatever holdMinutes says', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-23T10:00:00.000Z'))
    try {
      for (const holdMinutes of [undefined, 90]) {
        const s = stub({ holdMinutes })
        const out = await startPlaceSubmission({ payload: s, input: input() })
        expect(out).toMatchObject({ ok: true, expiresAt: '2026-11-24T10:00:00.000Z' })
        expect(created(s, 'place-upload-sessions')[0].data.expiresAt).toBe(
          '2026-11-24T10:00:00.000Z',
        )
      }
    } finally {
      vi.useRealTimers()
    }
  })

  describe('the cap on open forms per owner email', () => {
    const withOpen = (count: number) => {
      const s = stub()
      const find = s.find.getMockImplementation()!
      s.find.mockImplementation(async (args: { collection: string; where?: unknown }) => {
        if (
          args.collection === 'businesses' &&
          JSON.stringify(args.where).includes('submission.ownerEmail')
        ) {
          return { docs: [], totalDocs: count }
        }
        return find(args)
      })
      return s
    }

    it('refuses a fourth open form with too-many-open, and writes nothing', async () => {
      const s = withOpen(MAX_OPEN_STARTS_PER_EMAIL)
      const out = await startPlaceSubmission({ payload: s, input: input() })
      expect(out).toMatchObject({ ok: false, code: 'too-many-open' })
      expect(s.create).not.toHaveBeenCalled()
      expect(statusForOutcome('too-many-open')).toBe(429)
    })

    it('allows the start while under the cap, counting only incomplete forms of that email', async () => {
      const s = withOpen(MAX_OPEN_STARTS_PER_EMAIL - 1)
      expect(await startPlaceSubmission({ payload: s, input: input() })).toMatchObject({ ok: true })
      const where = JSON.stringify(
        s.find.mock.calls.find((c) => JSON.stringify(c[0].where).includes('ownerEmail'))![0].where,
      )
      expect(where).toContain('n@x.com')
      expect(where).toContain('incomplete')
    })

    it('counts inside the start transaction, under a lock per email', async () => {
      const s = withOpen(0)
      await startPlaceSubmission({ payload: s, input: input() })
      expect(locks).toContain('vardenia.place-start-email:n@x.com')
    })
  })

  it('also writes name and address (only) in the default locale for a non-default owner locale', async () => {
    const s = stub()
    await startPlaceSubmission({ payload: s, input: input({ locale: 'ar' }) })
    expect(s.update).toHaveBeenCalledTimes(1)
    const call = s.update.mock.calls[0]![0]
    expect(call).toMatchObject({
      collection: 'businesses',
      id: 555,
      locale: 'en',
      depth: 0,
      overrideAccess: true,
      req: { transactionID: 'tx' },
    })
    expect(Object.keys(call.data).sort()).toEqual(['address', 'name', 'submission'])
    expect(call.data.submission).toEqual({ reference: 'VD-555' })
    expect(call.data).toMatchObject({ name: 'Cafe Nour', address: 'Hamra St' })
    expect(call.context.skipAutoTranslate).toBe(true)
    expect(call.context.skipQrGeneration).toBe(true)
  })

  it('writes only the reference group for a default-locale owner', async () => {
    const s = stub()
    await startPlaceSubmission({ payload: s, input: input({ locale: 'en' }) })
    expect(Object.keys(s.update.mock.calls[0]![0].data)).toEqual(['submission'])
  })

  it('derives a unique reference from the record id', async () => {
    const out = await startPlaceSubmission({ payload: stub(), input: input() })
    expect(out).toMatchObject({ ok: true, reference: 'VD-555' })
  })

  it('maps a unique refusal on (issue, listing_number) to number-unavailable, leaving nothing', async () => {
    const refusal = Object.assign(new Error('Value must be unique'), {
      name: 'ValidationError',
      data: {
        errors: [
          {
            message: 'Value must be unique',
            path: 'issue_id, listing_number',
            tableName: 'businesses',
          },
        ],
      },
    })
    const s = stub({ failListing: refusal })
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(store.rows).toEqual([])
    expect(created(s, 'place-upload-sessions')).toHaveLength(0)
  })

  it('maps the number field validation refusing a number a rival just took', async () => {
    const refusal = Object.assign(new Error('The following field is invalid: listingNumber'), {
      name: 'ValidationError',
      data: {
        errors: [
          {
            message: 'Number 5 is already held by "Other" (listing 9) in this issue.',
            path: 'listingNumber',
          },
        ],
      },
    })
    const out = await startPlaceSubmission({
      payload: stub({ failListing: refusal }),
      input: input(),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(JSON.stringify(out)).not.toContain('Other')
    expect(store.rows).toEqual([])
  })

  it('also maps the raw driver error naming the index', async () => {
    const raw = Object.assign(new Error('dup'), {
      cause: { code: '23505', constraint: 'issue_listingNumber_idx' },
    })
    const out = await startPlaceSubmission({
      payload: stub({ failListing: raw }),
      input: input(),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(isListingNumberTaken(raw)).toBe(true)
  })

  it('rolls the draft back when the session cannot be created: no orphan draft', async () => {
    vi.mocked(reportError).mockClear()
    const s = stub({ failSession: new Error('db down') })
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toMatchObject({ ok: false, code: 'error' })
    expect(store.rows).toEqual([])
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('rolls everything back when the reference write fails', async () => {
    const s = stub({ failUpdate: new Error('boom') })
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toMatchObject({ ok: false, code: 'error' })
    expect(store.rows).toEqual([])
  })

  /**
   * The slug comes from the name, and the slug is unique, so a second "Cafe
   * Nour" (or two Arabic names that transliterate alike) must not fail for good.
   */
  describe('a name whose slug is taken', () => {
    const slugTaken = () =>
      Object.assign(new Error('Value must be unique'), {
        name: 'ValidationError',
        data: { errors: [{ message: 'x', path: 'slug', tableName: 'businesses' }] },
      })
    const rawSlugTaken = () =>
      Object.assign(new Error('dup'), {
        cause: { code: '23505', constraint: 'businesses_slug_idx' },
      })
    const listingCreates = (s: Stub) => created(s, 'businesses')

    it('tries the automatic slug first, then the name with the listing number', async () => {
      const s = stub({ listingErrors: [slugTaken()] })
      const out = await startPlaceSubmission({ payload: s, input: input({ name: 'Cafe Nour' }) })
      expect(out).toMatchObject({ ok: true, listingId: 555 })
      const calls = listingCreates(s)
      expect(calls).toHaveLength(2)
      expect(calls[0].data).not.toHaveProperty('slug')
      expect(calls[1].data.slug).toBe('cafe-nour-12')
      // One draft and one session survive the retry.
      expect(stored('businesses')).toHaveLength(1)
      expect(stored('place-upload-sessions')).toHaveLength(1)
    })

    it('uses the transliterated name for an Arabic name', async () => {
      const s = stub({ listingErrors: [rawSlugTaken()] })
      await startPlaceSubmission({
        payload: s,
        input: input({ name: 'مطعم' }),
      })
      expect(listingCreates(s)[1].data.slug).toBe('mtam-12')
    })

    it('then adds four random hex characters, fresh each time', async () => {
      const s = stub({ listingErrors: [slugTaken(), slugTaken(), slugTaken()] })
      const out = await startPlaceSubmission({ payload: s, input: input() })
      expect(out.ok).toBe(true)
      const slugs = listingCreates(s).map((c) => c.data.slug)
      expect(slugs).toHaveLength(4)
      expect(slugs[2]).toMatch(/^cafe-nour-12-[0-9a-f]{4}$/)
      expect(slugs[3]).toMatch(/^cafe-nour-12-[0-9a-f]{4}$/)
    })

    it('does not retry a taken listing number', async () => {
      const number = Object.assign(new Error('dup'), {
        cause: { code: '23505', constraint: 'issue_listingNumber_idx' },
      })
      const s = stub({ listingErrors: [number] })
      const out = await startPlaceSubmission({ payload: s, input: input() })
      expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
      expect(listingCreates(s)).toHaveLength(1)
    })

    it('gives up after three retries with the generic error, and reports it', async () => {
      vi.mocked(reportError).mockClear()
      const s = stub({ failListing: slugTaken() })
      const out = await startPlaceSubmission({ payload: s, input: input() })
      expect(out).toEqual({
        ok: false,
        code: 'error',
        message: 'We could not save that. Please try again.',
      })
      expect(listingCreates(s)).toHaveLength(4)
      expect(store.rows).toEqual([])
      expect(reportError).toHaveBeenCalledTimes(1)
    })

    it('does not retry any other failure', async () => {
      const s = stub({ listingErrors: [new Error('boom')] })
      const out = await startPlaceSubmission({ payload: s, input: input() })
      expect(out).toMatchObject({ ok: false, code: 'error' })
      expect(listingCreates(s)).toHaveLength(1)
    })
  })

  it('reports any other failure and leaks nothing', async () => {
    const out = await startPlaceSubmission({
      payload: stub({ failListing: new Error('connection to db.secret.internal refused') }),
      input: input(),
    })
    expect(out).toEqual({
      ok: false,
      code: 'error',
      message: 'We could not save that. Please try again.',
    })
    expect(reportError).toHaveBeenCalled()
  })
})

/**
 * An issue for one governorate (27 November 2026): its blocks are cities, and
 * a business is offered, and may start in, only the block of its own city.
 * The form is issue first: the issue decides the governorate, never the browser.
 */
describe('an issue for one governorate', () => {
  const matnOnly = { coverage: 'governorate', governorate: 'matn' }
  const cityRanges = [
    { issue: { id: 7, title: 'Matn' }, governorate: 'matn', city: 'dbayeh', from: 1, to: 9 },
    { issue: { id: 7, title: 'Matn' }, governorate: 'matn', city: 'broummana', from: 10, to: 20 },
  ]
  const businessQuery = (s: Stub) =>
    JSON.stringify(
      s.find.mock.calls.map((c) => c[0]).find((a) => a.collection === 'businesses')?.where,
    )
  const rangeQuery = (s: Stub) =>
    JSON.stringify(
      s.find.mock.calls.map((c) => c[0]).find((a) => a.collection === 'listing-ranges')?.where,
    )

  it('lists the block of the city, holding numbers by that city', async () => {
    const s = stub({ ranges: cityRanges, issue: matnOnly })
    const out = await listNumbersFor(s, 7, { city: 'broummana' })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ issueId: 7, coverage: 'governorate', from: 10, to: 20 })
    expect(out[0]!.layouts.map((l) => l.layout)).toEqual(['full-page', 'half-page'])
    expect(businessQuery(s)).toContain('"city":{"equals":"broummana"}')
    expect(businessQuery(s)).toContain('"governorate":{"equals":"matn"}')
  })

  it("takes the issue's governorate, never the one asked for", async () => {
    const s = stub({ ranges: cityRanges, issue: matnOnly })
    const out = await listNumbersFor(s, 7, { governorate: 'beirut', city: 'broummana' })
    expect(out[0]).toMatchObject({ from: 10, to: 20 })
    expect(rangeQuery(s)).toContain('"governorate":{"equals":"matn"}')
  })

  it('lists nothing for a city without a block, a city of another governorate, or no city', async () => {
    const s = stub({ ranges: cityRanges, issue: matnOnly })
    expect(await listNumbersFor(s, 7, { city: 'bikfaya' })).toEqual([])
    expect(await listNumbersFor(s, 7, { city: 'jounieh' })).toEqual([])
    expect(await listNumbersFor(s, 7, { governorate: 'matn' })).toEqual([])
    expect(await listNumbersFor(s, 7, { governorate: 'matn', city: null })).toEqual([])
    expect(s.find.mock.calls.some((c) => c[0].collection === 'businesses')).toBe(false)
  })

  it('lists nothing for a missing issue', async () => {
    const s = stub({ ranges: cityRanges, noIssue: true })
    expect(await listNumbersFor(s, 7, { city: 'broummana' })).toEqual([])
  })

  it('gives an All Lebanon issue its governorate block, ignoring any city', async () => {
    const s = stub({ issue: { coverage: 'all-lebanon' } })
    const out = await listNumbersFor(s, 7, { governorate: 'beirut', city: 'beirut' })
    expect(out[0]).toMatchObject({ from: 10, to: 20, taken: [11], coverage: 'all-lebanon' })
    expect(businessQuery(s)).not.toContain('"city"')
  })

  it('starts in the block of its city, under the issue governorate', async () => {
    const s = stub({ ranges: cityRanges, issue: matnOnly })
    const out = await startPlaceSubmission({
      payload: s,
      input: input({ governorate: 'matn', city: 'broummana', listingNumber: 12 }),
    })
    expect(out).toMatchObject({ ok: true, price: 500 })
    expect(businessQuery(s)).toContain('"city":{"equals":"broummana"}')
    const [listing] = created(s, 'businesses')
    expect(listing.data.governorate).toBe('matn')
    expect(listing.data.city).toBe('broummana')
  })

  it('never trusts the governorate sent: the listing gets the issue one', async () => {
    const s = stub({ ranges: cityRanges, issue: matnOnly })
    const out = await startPlaceSubmission({
      payload: s,
      input: input({ governorate: 'beirut', city: 'broummana', listingNumber: 12 }),
    })
    expect(out).toMatchObject({ ok: true })
    expect(rangeQuery(s)).toContain('"governorate":{"equals":"matn"}')
    expect(created(s, 'businesses')[0].data.governorate).toBe('matn')
  })

  it("refuses a number of another city's block, writing nothing", async () => {
    const s = stub({ ranges: cityRanges, issue: matnOnly })
    const out = await startPlaceSubmission({
      payload: s,
      input: input({ governorate: 'matn', city: 'dbayeh', listingNumber: 12 }),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it.each([
    ['a city with no block', 'bikfaya'],
    ['a city of another governorate', 'jounieh'],
    ['no city', undefined],
  ])('refuses %s as no-range, writing nothing', async (_name, city) => {
    const s = stub({ ranges: cityRanges, issue: matnOnly })
    const out = await startPlaceSubmission({
      payload: s,
      input: input({ governorate: 'matn', city, listingNumber: 12 }),
    })
    expect(out).toEqual({
      ok: false,
      code: 'no-range',
      message: 'Listings in that region are not open for this issue yet.',
    })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('still refuses a layout that is not on sale as a layout problem, before the number', async () => {
    const s = stub({
      ranges: cityRanges,
      issue: matnOnly,
      layouts: [{ layout: 'full-page', offered: false, price: 500 }],
    })
    const out = await startPlaceSubmission({
      payload: s,
      input: input({ governorate: 'matn', city: 'broummana', listingNumber: 99 }),
    })
    expect(out).toMatchObject({ ok: false, code: 'layout-unavailable' })
  })
})

describe('an All Lebanon issue at start', () => {
  it('stores no city, whatever was sent', async () => {
    const s = stub({ issue: { coverage: 'all-lebanon' } })
    const out = await startPlaceSubmission({ payload: s, input: input({ city: 'beirut' }) })
    expect(out).toMatchObject({ ok: true })
    const [listing] = created(s, 'businesses')
    expect(listing.data.governorate).toBe('beirut')
    expect(listing.data.city).toBeUndefined()
    const held = JSON.stringify(
      s.find.mock.calls.map((c) => c[0]).find((a) => a.collection === 'businesses')?.where,
    )
    expect(held).not.toContain('"city"')
  })

  it('refuses a missing issue as no-range, writing nothing', async () => {
    const s = stub({ noIssue: true })
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toMatchObject({ ok: false, code: 'no-range' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a governorate with no block in the issue as no-range', async () => {
    const s = stub()
    const out = await startPlaceSubmission({ payload: s, input: input({ governorate: 'matn' }) })
    expect(out).toMatchObject({ ok: false, code: 'no-range' })
    expect(s.create).not.toHaveBeenCalled()
  })
})

describe('openIssues', () => {
  it('lists the issues with a usable block, with only their title and coverage', async () => {
    const s = stub({
      ranges: [
        { issue: 7, governorate: 'beirut', city: null },
        { issue: 7, governorate: 'matn', city: null },
        { issue: 9, governorate: 'matn', city: 'dbayeh' },
      ],
      issues: [
        { id: 9, title: 'Matn', coverage: 'governorate', governorate: 'matn' },
        { id: 7, title: 'Summer', coverage: null, governorate: 'matn' },
      ],
    })
    expect(await openIssues(s, 'ar')).toEqual([
      { issueId: 9, title: 'Matn', coverage: 'governorate', governorate: 'matn' },
      // No coverage stored: All Lebanon, and no governorate.
      { issueId: 7, title: 'Summer', coverage: 'all-lebanon', governorate: null },
    ])
    const issuesQuery = s.find.mock.calls.map((c) => c[0]).find((a) => a.collection === 'issues')
    expect(issuesQuery.where).toEqual({ id: { in: [7, 9] } })
    expect(issuesQuery.select).toEqual({ title: true, coverage: true, governorate: true })
    expect(issuesQuery.locale).toBe('ar')
    expect(issuesQuery.overrideAccess).toBe(true)
    const rangesQuery = s.find.mock.calls
      .map((c) => c[0])
      .find((a) => a.collection === 'listing-ranges')
    expect(rangesQuery.select).toEqual({ issue: true, governorate: true, city: true })
  })

  it('leaves out an issue whose ranges serve no place of it', async () => {
    const s = stub({
      ranges: [
        // All Lebanon with only a city block: not usable.
        { issue: 7, governorate: 'beirut', city: 'beirut' },
        // One governorate (matn) with a governorate-wide block, and another governorate's city.
        { issue: 9, governorate: 'matn', city: null },
        { issue: 9, governorate: 'keserwan', city: 'jbeil' },
        // One governorate with no governorate set on the issue.
        { issue: 11, governorate: 'matn', city: 'dbayeh' },
        // Usable.
        { issue: 12, governorate: 'matn', city: 'dbayeh' },
      ],
      issues: [
        { id: 7, title: 'A', coverage: 'all-lebanon' },
        { id: 9, title: 'B', coverage: 'governorate', governorate: 'matn' },
        { id: 11, title: 'C', coverage: 'governorate', governorate: null },
        { id: 12, title: 'D', coverage: 'governorate', governorate: 'matn' },
      ],
    })
    expect((await openIssues(s)).map((i) => i.issueId)).toEqual([12])
  })

  it('lists nothing, and reads no issue, without any range', async () => {
    const s = stub({ range: false })
    expect(await openIssues(s)).toEqual([])
    expect(s.find.mock.calls.some((c) => c[0].collection === 'issues')).toBe(false)
  })
})

describe('issuePlaces', () => {
  it('counts the free slots of each governorate block of an All Lebanon issue', async () => {
    const s = stub({
      ranges: [
        { governorate: 'matn', city: null, from: 1, to: 9 },
        { governorate: 'beirut', city: null, from: 10, to: 20 },
      ],
      holders: [
        { listingNumber: 11, governorate: 'beirut', city: 'beirut' },
        // A holder in another governorate does not count against beirut.
        { listingNumber: 12, governorate: 'matn', city: null },
      ],
    })
    // beirut 10-20: full pages 12-20 (9) and half page 10 (11 is held): 10.
    // matn 1-9: only full page 9 is a slot on sale there.
    expect(await issuePlaces(s, 7)).toEqual([
      { governorate: 'beirut', city: null, free: 10 },
      { governorate: 'matn', city: null, free: 1 },
    ])
    const holders = s.find.mock.calls.map((c) => c[0]).find((a) => a.collection === 'businesses')
    expect(holders.select).toEqual({ governorate: true, city: true, listingNumber: true })
    expect(holders.overrideAccess).toBe(true)
  })

  it('marks a block with no free slot of a layout on sale as full (free 0)', async () => {
    const s = stub({
      layouts: [{ layout: 'half-page', offered: true, price: 300 }],
      held: [10, 11],
    })
    expect(await issuePlaces(s, 7)).toEqual([{ governorate: 'beirut', city: null, free: 0 }])
  })

  it('counts per city on an issue for one governorate, leaving out blocks that fit no place', async () => {
    const s = stub({
      issue: { coverage: 'governorate', governorate: 'matn' },
      ranges: [
        { governorate: 'matn', city: 'broummana', from: 10, to: 20 },
        { governorate: 'matn', city: 'dbayeh', from: 1, to: 9 },
        // Another governorate, and a governorate-wide block: not places of this issue.
        { governorate: 'beirut', city: 'beirut', from: 21, to: 25 },
        { governorate: 'matn', city: null, from: 26, to: 30 },
      ],
      holders: [
        { listingNumber: 12, governorate: 'matn', city: 'broummana' },
        // Held in dbayeh: does not count against broummana.
        { listingNumber: 13, governorate: 'matn', city: 'dbayeh' },
      ],
    })
    // Cities in core regions' order: Dbayeh before Broummana.
    expect(await issuePlaces(s, 7)).toEqual([
      { governorate: 'matn', city: 'dbayeh', free: 1 },
      { governorate: 'matn', city: 'broummana', free: 10 },
    ])
  })

  it('lists nothing for a missing issue', async () => {
    expect(await issuePlaces(stub({ noIssue: true }), 7)).toEqual([])
  })
})
