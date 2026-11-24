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
  listNumbersFor,
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
    district: 'beirut',
    address: 'Hamra St',
    acceptsWhish: true,
    publicPhone: '+9611',
    instagram: 'https://instagram.com/cafenour',
    facebook: undefined,
    ownerName: 'Nour',
    ownerEmail: 'n@x.com',
    ownerPhone: '+9617',
    pageTemplate: 'a',
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
}

/** A payload with one beirut range 10-20 in issue 7 and number 11 taken. */
function stub(
  opts: {
    range?: boolean
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
  const find = vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === 'listing-ranges') {
      return {
        docs:
          opts.range === false
            ? []
            : [{ issue: { id: 7, title: 'Summer' }, governorate: 'beirut', from: 10, to: 20 }],
      }
    }
    if (collection === 'businesses') return { docs: [{ listingNumber: 11 }] }
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
  const update = vi.fn(async () => {
    if (opts.failUpdate) throw opts.failUpdate
    return { id: 555 }
  })
  const findGlobal = vi.fn(async () => ({
    magazinePlaces: opts.holdMinutes ? { holdMinutes: opts.holdMinutes } : {},
  }))
  return { find, create, update, findGlobal } as unknown as Stub & Payload
}

const created = (s: Stub, collection: string) =>
  s.create.mock.calls.map((c) => c[0]).filter((a) => a.collection === collection)

const stored = (collection: string) =>
  (store.rows as Row[]).filter((row) => row.collection === collection)

describe('listNumbersFor', () => {
  it('returns the range and what is taken, never who holds it', async () => {
    const s = stub()
    const out = await listNumbersFor(s, 'beirut')
    expect(out).toEqual([{ issueId: 7, issueTitle: 'Summer', from: 10, to: 20, taken: [11] }])
    const businessQuery = s.find.mock.calls
      .map((c) => c[0])
      .find((a) => a.collection === 'businesses')
    expect(businessQuery.select).toEqual({ listingNumber: true })
    expect(businessQuery.overrideAccess).toBe(true)
  })

  it('returns nothing for a governorate with no range', async () => {
    expect(await listNumbersFor(stub({ range: false }), 'matn')).toEqual([])
  })
})

describe('startPlaceSubmission', () => {
  it('refuses a number outside the range, writing nothing', async () => {
    const s = stub()
    const out = await startPlaceSubmission({ payload: s, input: input({ listingNumber: 99 }) })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a number another listing holds, writing nothing', async () => {
    const s = stub()
    const out = await startPlaceSubmission({ payload: s, input: input({ listingNumber: 11 }) })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a governorate with no range', async () => {
    const s = stub({ range: false })
    const out = await startPlaceSubmission({ payload: s, input: input() })
    expect(out).toMatchObject({ ok: false, code: 'no-range' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a hidden kind even if the schema was bypassed', async () => {
    for (const kind of ['car-rental', 'guided-tours', 'nonsense']) {
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
        'district',
        'address',
        'payments',
        'issue',
        'listingNumber',
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
      'status',
    ])
    expect(listing.data).not.toHaveProperty('tier')
    expect(listing.data.description.root.children).toHaveLength(2)
    // Category comes from the one kind; payments hold only Whish.
    expect(listing.data.category).toBe('food-and-beverage')
    expect(listing.data.subcategories).toEqual(['cafes'])
    // The district is stored as the slug the Businesses district select takes.
    expect(listing.data.governorate).toBe('beirut')
    expect(listing.data.district).toBe('beirut')
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
