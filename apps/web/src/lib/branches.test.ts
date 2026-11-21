import { describe, expect, it, vi } from 'vitest'
import type { BranchRequest } from '@vardenia/core'
import {
  SlugTaken,
  memoryPayload,
  type MemoryPayload,
  type Row,
} from './__fixtures__/memory-payload'
import { BRAND_NAME_MAX, capName, createBranch, type BranchPartner } from './branches'

/**
 * A partner adds a branch of their restaurant (Task 9). Runs the real service
 * against the in-memory payload, whose `transaction` restores everything when
 * the callback throws, as the database does on a rollback.
 */

const NOW = new Date('2026-11-21T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

/** The submission group the branch flow writes on every branch it makes. */
const branchSubmission = (h: number) => ({
  status: 'pending',
  ownerEmail: 'owner@example.com',
  submittedAt: hoursAgo(h),
})

const richText = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

const source = (over: Partial<Row> = {}): Row => ({
  id: 10,
  name: { en: 'Cafe Nour', ar: 'Kahwet Nour' },
  slug: 'cafe-nour',
  tagline: { en: 'Coffee since 1990', ar: 'Ahwe' },
  description: { en: richText('English text'), ar: richText('Arabic text') },
  address: { en: 'Hamra street' },
  category: 'food-and-beverage',
  subcategories: ['restaurants'],
  heroImage: 50,
  gallery: [51, 52],
  logo: 53,
  menu: 54,
  amenities: ['wifi', 'outdoor-seating'],
  payments: { cash: true, card: true, whish: false, omt: false },
  priceRange: '$$',
  contact: {
    phone: '+961 1 111111',
    instagram: 'https://instagram.com/nour',
    email: 'hi@nour.example',
  },
  seatingAreas: [
    {
      id: 'a1',
      setting: 'indoor',
      smoking: false,
      tables: 5,
      label: { en: 'Main room', ar: 'Salle' },
    },
    { id: 'a2', setting: 'outdoor', smoking: true, tables: 3, label: null },
  ],
  governorate: 'beirut',
  district: 'beirut',
  area: 5,
  mapUrl: 'https://www.google.com/maps/@33.89,35.48,17z',
  location: [35.48, 33.89],
  openingHours: [{ id: 'h1', day: 'mon', opens: '08:00', closes: '22:00', closed: false }],
  tags: ['brunch'],
  _status: 'published',
  tier: 'gold',
  verified: true,
  commission: 12,
  contractStartsAt: '2026-01-01',
  contractEndsAt: '2027-01-01',
  internalNotes: 'secret',
  qrCode: 9,
  issue: 2,
  listingNumber: 14,
  importBatch: 'batch-1',
  booking: { enabled: true, capacity: 30, autoConfirm: true },
  submission: { status: 'approved', ownerEmail: 'owner@example.com' },
  createdAt: hoursAgo(24 * 200),
  ...over,
})

const partnerRow = (businesses: number[] = [10, 30]): Row => ({
  id: 3,
  email: 'owner@example.com',
  name: 'Rita',
  phone: '+96170000000',
  businesses,
})

const partner: BranchPartner = {
  id: 3,
  email: 'owner@example.com',
  name: 'Rita',
  phone: '+96170000000',
}

const input = (over: Partial<BranchRequest> = {}): BranchRequest => ({
  sourceListingId: 10,
  name: 'Cafe Nour Jounieh',
  governorate: 'keserwan',
  district: 'keserwan',
  address: 'Main road, Jounieh',
  mapUrl: 'https://www.google.com/maps/@33.98,35.61,17z',
  openingHours: [{ day: 'tue', opens: '09:00', closes: '23:00', closed: false }],
  ...over,
})

type Lock = (req: unknown, key: string) => Promise<void>

/**
 * A keyed async mutex for the in-memory transactions: a lock is held until
 * its transaction commits or rolls back (released from `req.afterEnd`), like
 * pg_advisory_xact_lock.
 */
function keyedMutex(only = ''): Lock {
  const tails = new Map<string, Promise<void>>()
  return async (req, key) => {
    // Only the lock class under test is real; the others do nothing.
    if (!key.startsWith(only)) return
    const previous = tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const mine = new Promise<void>((resolve) => (release = resolve))
    tails.set(
      key,
      previous.then(() => mine),
    )
    ;(req as { afterEnd: (() => void)[] }).afterEnd.push(release)
    await previous
  }
}

function setup(
  seed: {
    businesses?: Row[]
    brands?: Row[]
    partner?: Row
    partners?: Row[]
    lock?: Lock
    slowWrites?: boolean
  } = {},
) {
  const payload = memoryPayload(
    {
      'business-users': seed.partners ?? [seed.partner ?? partnerRow()],
      brands: seed.brands ?? [],
      businesses: seed.businesses ?? [
        source(),
        {
          id: 30,
          name: 'Hotel Sea',
          slug: 'hotel-sea',
          subcategories: ['hotels'],
          _status: 'published',
          createdAt: hoursAgo(5000),
        },
        {
          id: 40,
          name: 'Other place',
          slug: 'other',
          subcategories: ['restaurants'],
          _status: 'published',
          createdAt: hoursAgo(5000),
        },
      ],
    },
    { now: NOW, slowWrites: seed.slowWrites },
  )
  const locks: string[] = []
  const run = (body: BranchRequest = input(), who: BranchPartner = partner) =>
    createBranch({
      payload: payload as never,
      partner: who,
      input: body,
      deps: {
        transaction: (fn) => payload.transaction(fn as never) as never,
        lock: async (req, key) => {
          locks.push(key)
          await seed.lock?.(req, key)
        },
        now: NOW,
        report: async () => {},
      },
    })
  return { payload, run, locks }
}

const newListings = (payload: MemoryPayload) =>
  payload.db.businesses!.filter(
    (row) =>
      ![10, 30, 40].includes(row.id) && row.id < 9000 && !String(row.slug).startsWith('seed-'),
  )

describe('createBranch: the first branch', () => {
  it('creates the brand from the source, links the source, and drafts the branch', async () => {
    const { payload, run } = setup()
    const outcome = await run()
    expect(outcome).toMatchObject({ ok: true, brandCreated: true })
    if (!outcome.ok) return

    const brands = payload.db.brands!
    expect(brands).toHaveLength(1)
    expect(brands[0]).toMatchObject({ name: 'Cafe Nour', id: outcome.brandId })
    expect(brands[0]!.published).toBeUndefined()

    const src = payload.db.businesses!.find((r) => r.id === 10)!
    expect(src.brand).toBe(outcome.brandId)

    const branch = payload.db.businesses!.find((r) => r.id === outcome.listingId)!
    expect(branch).toMatchObject({
      name: 'Cafe Nour Jounieh',
      brand: outcome.brandId,
      _status: 'draft',
      governorate: 'keserwan',
      district: 'keserwan',
      address: 'Main road, Jounieh',
      mapUrl: 'https://www.google.com/maps/@33.98,35.61,17z',
      booking: { enabled: false },
      category: 'food-and-beverage',
      subcategories: ['restaurants'],
      heroImage: 50,
      gallery: [51, 52],
      logo: 53,
      menu: 54,
      amenities: ['wifi', 'outdoor-seating'],
      payments: { cash: true, card: true, whish: false, omt: false },
      contact: {
        phone: '+961 1 111111',
        instagram: 'https://instagram.com/nour',
        email: 'hi@nour.example',
      },
      openingHours: [{ day: 'tue', opens: '09:00', closes: '23:00', closed: false }],
      submission: {
        status: 'pending',
        ownerName: 'Rita',
        ownerEmail: 'owner@example.com',
        ownerPhone: '+96170000000',
        submittedAt: NOW.toISOString(),
      },
    })
    // The default-locale copy goes into the create (the in-memory store keeps
    // one value per field, so the Arabic update below would overwrite it).
    const create = payload.calls.find(
      (c) => c.op === 'create' && c.args.collection === 'businesses',
    )!
    expect(create.args.data).toMatchObject({
      tagline: 'Coffee since 1990',
      description: richText('English text'),
    })
    expect((create.args.data as { seatingAreas: unknown }).seatingAreas).toEqual([
      { setting: 'indoor', smoking: false, tables: 5, label: 'Main room' },
      { setting: 'outdoor', smoking: true, tables: 3 },
    ])
  })

  it('appends the branch to the partner through the system', async () => {
    const { payload, run } = setup()
    const outcome = await run()
    if (!outcome.ok) throw new Error('expected ok')
    expect(payload.db['business-users']![0]!.businesses).toEqual([10, 30, outcome.listingId])
    const write = payload.calls.find(
      (c) => c.op === 'update' && c.args.collection === 'business-users',
    )!
    expect(write.args.overrideAccess).toBe(true)
  })

  it('copies an allow-list only: nothing commercial, magazine, QR or staff-only', async () => {
    const { payload, run } = setup()
    const outcome = await run()
    if (!outcome.ok) throw new Error('expected ok')
    const branch = payload.db.businesses!.find((r) => r.id === outcome.listingId)!
    for (const key of [
      'tier',
      'verified',
      'commission',
      'contractStartsAt',
      'contractEndsAt',
      'internalNotes',
      'qrCode',
      'issue',
      'listingNumber',
      'importBatch',
      'tags',
      'area',
      'location',
      'priceRange',
      'seo',
      'salesOwner',
    ]) {
      expect(branch[key], key).toBeUndefined()
    }
    expect(branch.slug).not.toBe('cafe-nour')
  })

  it('ignores whatever else a body smuggles in, even past the schema', async () => {
    const { payload, run } = setup()
    const evil = {
      ...input(),
      tier: 'platinum',
      verified: true,
      slug: 'cafe-nour',
      _status: 'published',
      booking: { enabled: true },
      qrCode: 1,
      brand: 999,
      submission: { status: 'approved' },
      contractEndsAt: '2099-01-01',
    } as unknown as BranchRequest
    const outcome = await run(evil)
    if (!outcome.ok) throw new Error('expected ok')
    const branch = payload.db.businesses!.find((r) => r.id === outcome.listingId)!
    expect(branch).toMatchObject({
      _status: 'draft',
      booking: { enabled: false },
      brand: outcome.brandId,
    })
    expect(branch.tier).toBeUndefined()
    expect(branch.verified).toBeUndefined()
    expect(branch.qrCode).toBeUndefined()
    expect(branch.contractEndsAt).toBeUndefined()
    expect(branch.slug).not.toBe('cafe-nour')
    expect((branch.submission as { status: string }).status).toBe('pending')
  })

  it('writes the listing like the public submission: no QR, no translation, overriding access', async () => {
    const { payload, run } = setup()
    await run()
    const create = payload.calls.find(
      (c) => c.op === 'create' && c.args.collection === 'businesses',
    )!
    expect(create.args).toMatchObject({
      overrideAccess: true,
      locale: 'en',
      context: { skipQrGeneration: true, skipAutoTranslate: true },
    })
    // Every write joins the one transaction.
    const writes = payload.calls.filter((c) => c.op === 'create' || c.op === 'update')
    expect(writes.length).toBeGreaterThan(2)
    const tx = (w: (typeof writes)[number]) =>
      (w.args.req as { transactionID?: string })?.transactionID
    expect(tx(writes[0]!)).toMatch(/^tx\d+$/)
    for (const w of writes) expect(tx(w)).toBe(tx(writes[0]!))
  })

  it("names a locale on every call after the source is read with 'all'", async () => {
    const { payload, run } = setup()
    await run()
    const index = payload.calls.findIndex((c) => c.args.locale === 'all')
    expect(index).toBeGreaterThan(-1)
    for (const call of payload.calls.slice(index + 1)) {
      expect(call.args.locale, `${call.op} ${String(call.args.collection)}`).toMatch(/^[a-z]{2}$/)
    }
  })

  it('copies the other languages of the tagline, description and area labels', async () => {
    const { payload, run } = setup()
    const outcome = await run()
    if (!outcome.ok) throw new Error('expected ok')
    const ar = payload.calls.find(
      (c) => c.op === 'update' && c.args.collection === 'businesses' && c.args.locale === 'ar',
    )!
    expect(ar).toBeDefined()
    expect(ar.args.id).toBe(outcome.listingId)
    expect(ar.args.data).toMatchObject({
      tagline: 'Ahwe',
      description: richText('Arabic text'),
    })
    const areas = (ar.args.data as { seatingAreas: { label?: string }[] }).seatingAreas
    expect(areas[0]!.label).toBe('Salle')
  })

  it('takes a point instead of a link', async () => {
    const { payload, run } = setup()
    const outcome = await run(input({ mapUrl: undefined, location: [35.6, 33.9] }))
    if (!outcome.ok) throw new Error('expected ok')
    const branch = payload.db.businesses!.find((r) => r.id === outcome.listingId)!
    expect(branch.location).toEqual([35.6, 33.9])
    expect(branch.mapUrl).toBeUndefined()
  })

  it('lets the body override contact fields one by one', async () => {
    const { payload, run } = setup()
    const outcome = await run(
      input({ contact: { phone: '+961 9 999999', whatsapp: '+96171000000' } }),
    )
    if (!outcome.ok) throw new Error('expected ok')
    const branch = payload.db.businesses!.find((r) => r.id === outcome.listingId)!
    expect(branch.contact).toEqual({
      phone: '+961 9 999999',
      whatsapp: '+96171000000',
      instagram: 'https://instagram.com/nour',
      email: 'hi@nour.example',
    })
  })

  it('takes the locks partner, source, brand, in that order', async () => {
    const { run, locks } = setup()
    const outcome = await run()
    if (!outcome.ok) throw new Error('expected ok')
    expect(locks).toEqual([
      'vardenia.branches.partner:3',
      'vardenia.branches.source:10',
      `vardenia.branches.brand:${outcome.brandId}`,
    ])
  })
})

describe('createBranch: the brand is made once', () => {
  it('reuses the brand on a second branch', async () => {
    const { payload, run } = setup()
    const first = await run()
    const second = await run(
      input({ name: 'Cafe Nour Batroun', governorate: 'north-lebanon', district: 'batroun' }),
    )
    expect(first).toMatchObject({ ok: true, brandCreated: true })
    expect(second).toMatchObject({ ok: true, brandCreated: false })
    if (!first.ok || !second.ok) return
    expect(second.brandId).toBe(first.brandId)
    expect(payload.db.brands).toHaveLength(1)
    expect(
      payload.calls.filter((c) => c.op === 'create' && c.args.collection === 'brands'),
    ).toHaveLength(1)
    expect(payload.db['business-users']![0]!.businesses).toEqual([
      10,
      30,
      first.listingId,
      second.listingId,
    ])
  })

  it('gives the brand a free slug when the name is taken by another brand', async () => {
    const { payload, run } = setup({
      brands: [{ id: 1, name: 'Cafe Nour', slug: 'cafe-nour', published: true }],
    })
    const outcome = await run()
    expect(outcome.ok).toBe(true)
    const made = payload.db.brands!.find((b) => b.id !== 1)!
    expect(made.slug).toMatch(/^cafe-nour-[a-z0-9-]+$/)
  })
})

describe('createBranch: refusals', () => {
  it('refuses a source the partner does not own, like one that does not exist', async () => {
    const a = setup()
    const notOwned = await a.run(input({ sourceListingId: 40 }))
    const b = setup()
    const missing = await b.run(input({ sourceListingId: 4040 }))
    expect(notOwned).toEqual(missing)
    expect(notOwned).toMatchObject({ ok: false, code: 'not-found', status: 404 })
    expect(a.payload.db.brands).toHaveLength(0)
    expect(newListings(a.payload)).toHaveLength(0)
  })

  it('trusts the partner row, not the session: a listing taken away is refused', async () => {
    const { payload, run } = setup({ partner: partnerRow([30]) })
    const outcome = await run()
    expect(outcome).toMatchObject({ ok: false, code: 'not-found' })
    expect(payload.db.brands).toHaveLength(0)
  })

  it('refuses a source in the trash', async () => {
    const { run } = setup({ businesses: [source({ deletedAt: hoursAgo(1) })] })
    expect(await run()).toMatchObject({ ok: false, code: 'not-found' })
  })

  it('refuses a source that is not a restaurant', async () => {
    const { payload, run } = setup()
    const outcome = await run(input({ sourceListingId: 30 }))
    expect(outcome).toMatchObject({ ok: false, code: 'not-restaurant', status: 400 })
    expect(payload.db.brands).toHaveLength(0)
    expect(payload.calls.filter((c) => c.op === 'create' || c.op === 'update')).toHaveLength(0)
  })

  it('refuses the 21st listing of a brand', async () => {
    const others = Array.from({ length: 19 }, (_, i) => ({
      id: 100 + i,
      name: `Branch ${i}`,
      slug: `seed-${i}`,
      subcategories: ['restaurants'],
      brand: 7,
      _status: 'published',
      createdAt: hoursAgo(1000),
    }))
    const { payload, run } = setup({
      brands: [{ id: 7, name: 'Cafe Nour', slug: 'cafe-nour', published: true }],
      businesses: [source({ brand: 7 }), ...others],
    })
    const outcome = await run()
    expect(outcome).toMatchObject({ ok: false, code: 'brand-full', status: 409 })
    expect(payload.db.businesses).toHaveLength(20)
  })

  it('allows the 20th', async () => {
    const others = Array.from({ length: 18 }, (_, i) => ({
      id: 100 + i,
      name: `Branch ${i}`,
      slug: `seed-${i}`,
      subcategories: ['restaurants'],
      brand: 7,
      _status: 'published',
      createdAt: hoursAgo(1000),
    }))
    const { run } = setup({
      brands: [{ id: 7, name: 'Cafe Nour', slug: 'cafe-nour', published: true }],
      businesses: [source({ brand: 7 }), ...others],
    })
    expect(await run()).toMatchObject({ ok: true })
  })

  it('refuses a sixth branch in 24 hours, counting the trash, not older ones', async () => {
    const recent = (id: number, h: number, extra: Partial<Row> = {}) => ({
      id,
      name: `B${id}`,
      slug: `seed-${id}`,
      subcategories: ['restaurants'],
      brand: 7,
      _status: 'draft',
      createdAt: hoursAgo(h),
      submission: branchSubmission(h),
      ...extra,
    })
    const ids = [201, 202, 203, 204, 205, 206]
    const businesses = [
      source({ brand: 7 }),
      recent(201, 1),
      recent(202, 2),
      recent(203, 3),
      recent(204, 23, { deletedAt: hoursAgo(1) }),
      recent(205, 30), // older than a day: not counted
      recent(206, 4),
    ]
    const make = (owned: number[]) =>
      setup({
        brands: [{ id: 7, name: 'Cafe Nour', slug: 'cafe-nour', published: true }],
        businesses,
        partner: partnerRow([10, ...owned]),
      })
    // Five in the last day (one trashed): refused.
    expect(await make(ids).run()).toMatchObject({ ok: false, code: 'daily-limit', status: 429 })
    // Four: allowed.
    expect(await make(ids.filter((id) => id !== 206)).run()).toMatchObject({ ok: true })
  })

  it('counts only the partner own listings for the daily limit', async () => {
    const strangers = Array.from({ length: 6 }, (_, i) => ({
      id: 300 + i,
      name: `S${i}`,
      slug: `seed-s${i}`,
      subcategories: ['restaurants'],
      brand: 7,
      _status: 'draft',
      createdAt: hoursAgo(1),
      submission: branchSubmission(1),
    }))
    const { run } = setup({
      brands: [{ id: 7, name: 'Cafe Nour', slug: 'cafe-nour', published: true }],
      businesses: [source({ brand: 7 }), ...strangers],
    })
    expect(await run()).toMatchObject({ ok: true })
  })
})

describe('createBranch: slugs', () => {
  it('skips a slug that is already taken, as the submission route does', async () => {
    const { payload, run } = setup({
      businesses: [
        source(),
        {
          id: 41,
          name: 'X',
          slug: 'cafe-nour-jounieh',
          subcategories: ['cafes'],
          createdAt: hoursAgo(9000),
        },
      ],
    })
    const outcome = await run()
    if (!outcome.ok) throw new Error('expected ok')
    const branch = payload.db.businesses!.find((r) => r.id === outcome.listingId)!
    expect(branch.slug).toBe('cafe-nour-jounieh-keserwan')
  })

  it('counts a trashed listing slug as taken', async () => {
    const { payload, run } = setup({
      businesses: [
        source(),
        {
          id: 41,
          name: 'X',
          slug: 'cafe-nour-jounieh',
          deletedAt: hoursAgo(2),
          createdAt: hoursAgo(9000),
        },
      ],
    })
    const outcome = await run()
    if (!outcome.ok) throw new Error('expected ok')
    expect(payload.db.businesses!.find((r) => r.id === outcome.listingId)!.slug).not.toBe(
      'cafe-nour-jounieh',
    )
  })

  it('retries the whole branch when another save takes the slug in between', async () => {
    const { payload, run } = setup()
    let clashes = 1
    payload.failOn((op, args) => {
      if (op === 'create' && args.collection === 'businesses' && clashes > 0) {
        clashes--
        return new SlugTaken('businesses')
      }
      return undefined
    })
    const outcome = await run()
    expect(outcome).toMatchObject({ ok: true, brandCreated: true })
    expect(payload.db.brands).toHaveLength(1)
    expect(newListings(payload)).toHaveLength(1)
  })

  it('gives up with an error after repeated clashes, leaving nothing behind', async () => {
    const { payload, run } = setup()
    payload.failOn((op, args) =>
      op === 'create' && args.collection === 'businesses' ? new SlugTaken('businesses') : undefined,
    )
    const outcome = await run()
    expect(outcome).toMatchObject({ ok: false, code: 'error', status: 500 })
    expect(payload.db.brands).toHaveLength(0)
    expect(newListings(payload)).toHaveLength(0)
  })
})

describe('createBranch: all or nothing', () => {
  it('leaves no brand, no listing and the source untouched when a late step fails', async () => {
    const { payload, run } = setup()
    payload.failOn((op, args) =>
      op === 'update' && args.collection === 'business-users' ? new Error('db down') : undefined,
    )
    const outcome = await run()
    expect(outcome).toMatchObject({ ok: false, code: 'error', status: 500 })
    expect(payload.db.brands).toHaveLength(0)
    expect(newListings(payload)).toHaveLength(0)
    expect(payload.db.businesses!.find((r) => r.id === 10)!.brand).toBeUndefined()
    expect(payload.db['business-users']![0]!.businesses).toEqual([10, 30])
  })

  it('reports an unexpected failure', async () => {
    const report = vi.fn(async () => {})
    const { payload } = setup()
    payload.failOn((op) => (op === 'create' ? new Error('boom') : undefined))
    const outcome = await createBranch({
      payload: payload as never,
      partner,
      input: input(),
      deps: {
        transaction: (fn) => payload.transaction(fn as never) as never,
        lock: async () => {},
        now: NOW,
        report,
      },
    })
    expect(outcome.ok).toBe(false)
    expect(report).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Review fixes (Task 9 fix round 1)
// ---------------------------------------------------------------------------

describe('createBranch: only a live, accepted listing can be a source', () => {
  it.each([
    ['a draft', { _status: 'draft' }],
    [
      'a rejected submission (seeded directly; Payload would refuse to save it)',
      { submission: { status: 'rejected', ownerEmail: 'owner@example.com' } },
    ],
  ])('refuses %s like a listing that does not exist', async (_label, over) => {
    const { payload, run } = setup({ businesses: [source(over as Partial<Row>)] })
    const outcome = await run()
    const missing = await setup().run(input({ sourceListingId: 4040 }))
    expect(outcome).toEqual(missing)
    expect(payload.calls.filter((c) => c.op === 'create' || c.op === 'update')).toHaveLength(0)
  })
})

describe('createBranch: long names', () => {
  // 300 Arabic letters in words of five, each letter a two-letter digraph
  // when transliterated, so the plain slug would be about 600 characters.
  const longArabic = Array.from({ length: 60 }, () => '\u062e\u0634\u062e\u0634\u062e').join(' ')

  it('cuts the brand name to 160 at a word boundary and keeps slugs within the public lookup', async () => {
    const { payload, run } = setup({ businesses: [source({ name: { en: longArabic } })] })
    const outcome = await run(input({ name: longArabic.slice(0, 160) }))
    expect(outcome).toMatchObject({ ok: true })
    const brand = payload.calls.find((c) => c.op === 'create' && c.args.collection === 'brands')!
    const data = brand.args.data as { name: string; slug: string }
    expect(Array.from(data.name).length).toBeLessThanOrEqual(160)
    expect(data.name.endsWith(' ')).toBe(false)
    expect(longArabic.startsWith(data.name)).toBe(true)
    expect(longArabic.charAt(data.name.length)).toBe(' ')
    expect(data.slug).toMatch(/^[a-z0-9-]{1,200}$/)
    expect(data.slug.endsWith('-')).toBe(false)
    const listing = payload.calls.find(
      (c) => c.op === 'create' && c.args.collection === 'businesses',
    )!
    expect((listing.args.data as { slug: string }).slug).toMatch(/^[a-z0-9-]{1,200}$/)
  })

  it('hard-cuts a name with no space in reach, never splitting a character', async () => {
    const solid = '\u{1F600}'.repeat(200)
    const { payload, run } = setup({ businesses: [source({ name: { en: solid } })] })
    expect(await run()).toMatchObject({ ok: true })
    const brand = payload.calls.find((c) => c.op === 'create' && c.args.collection === 'brands')!
    const name = (brand.args.data as { name: string }).name
    // 160 is Payload's maxLength, counted in UTF-16 units: 80 emoji.
    expect(name).toBe('\u{1F600}'.repeat(80))
  })
})

describe('capName counts what Payload maxLength counts (UTF-16 units)', () => {
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

  it('caps 170 emoji at 160 units without splitting a surrogate pair', () => {
    const out = capName('\u{1F600}'.repeat(170))
    expect(out.length).toBeLessThanOrEqual(BRAND_NAME_MAX)
    expect(out).toBe('\u{1F600}'.repeat(80))
    expect(lone.test(out)).toBe(false)
  })

  it('keeps an odd boundary whole: one ASCII letter then emoji', () => {
    const out = capName('a' + '\u{1F600}'.repeat(100))
    expect(out).toBe('a' + '\u{1F600}'.repeat(79))
    expect(lone.test(out)).toBe(false)
  })

  it('never cuts a combining mark off its base (300-unit Arabic with vowel marks, no spaces)', () => {
    // ba + fatha, repeated: 150 pairs = 300 UTF-16 units.
    const marked = '\u0628\u064E'.repeat(150)
    const out = capName(marked)
    expect(out.length).toBeLessThanOrEqual(BRAND_NAME_MAX)
    expect(marked.startsWith(out)).toBe(true)
    expect(/\p{M}/u.test(marked.charAt(out.length))).toBe(false)
    expect(out.length % 2).toBe(0)
  })

  it('cuts a 300-character Arabic name with spaces at a word boundary within 160 units', () => {
    const words = Array.from({ length: 50 }, () => '\u0645\u0637\u0639\u0645\u0020').join('')
    const name = words.repeat(2).slice(0, 300)
    const out = capName(name)
    expect(out.length).toBeLessThanOrEqual(BRAND_NAME_MAX)
    expect(out.endsWith(' ')).toBe(false)
    expect(name.charAt(out.length)).toBe(' ')
  })

  it('leaves a short name as it is, trimmed', () => {
    expect(capName('  Cafe Nour  ')).toBe('Cafe Nour')
  })
})

describe('createBranch: the daily limit counts branches only', () => {
  const branchRow = (id: number, h: number, extra: Partial<Row> = {}) => ({
    id,
    name: `B${id}`,
    slug: `seed-${id}`,
    subcategories: ['restaurants'],
    brand: 7,
    _status: 'draft',
    createdAt: hoursAgo(h),
    submission: branchSubmission(h),
    ...extra,
  })
  const brand7 = [{ id: 7, name: 'Cafe Nour', slug: 'cafe-nour', published: true }]
  const four = [201, 202, 203, 204]

  it('does not count a source submitted an hour ago that just got its brand', async () => {
    const { run } = setup({
      brands: brand7,
      businesses: [
        source({ brand: 7, createdAt: hoursAgo(1) }),
        ...four.map((id) => branchRow(id, 2)),
      ],
      partner: partnerRow([10, ...four]),
    })
    expect(await run()).toMatchObject({ ok: true })
  })

  it('does not count a second restaurant submitted the same day', async () => {
    const second = source({
      id: 11,
      slug: 'cafe-nour-2',
      brand: 8,
      listingNumber: 15,
      createdAt: hoursAgo(3),
    })
    const { run } = setup({
      brands: [...brand7, { id: 8, name: 'Other', slug: 'other-brand', published: true }],
      businesses: [
        source({ brand: 7, createdAt: hoursAgo(1) }),
        second,
        ...four.map((id) => branchRow(id, 2)),
      ],
      partner: partnerRow([10, 11, ...four]),
    })
    expect(await run()).toMatchObject({ ok: true })
  })

  it('does not count a staff-made restaurant (no issue) that became a source today', async () => {
    // Staff made it an hour ago: no issue, no submission. Its first branch
    // request gave it a brand; it is not a branch.
    const staffMade = source({ brand: 7, issue: null, submission: null, createdAt: hoursAgo(1) })
    const { run } = setup({
      brands: brand7,
      businesses: [staffMade, ...four.map((id) => branchRow(id, 2))],
      partner: partnerRow([10, ...four]),
    })
    expect(await run()).toMatchObject({ ok: true })
  })

  it('does not count another staff-made restaurant that was a source earlier today', async () => {
    const other = source({
      id: 12,
      slug: 'cafe-nour-staff',
      brand: 8,
      issue: null,
      submission: null,
      createdAt: hoursAgo(3),
    })
    const { run } = setup({
      brands: [...brand7, { id: 8, name: 'Other', slug: 'other-brand', published: true }],
      businesses: [source({ brand: 7 }), other, ...four.map((id) => branchRow(id, 2))],
      partner: partnerRow([10, 12, ...four]),
    })
    expect(await run()).toMatchObject({ ok: true })
  })

  it('still counts a branch staff already published', async () => {
    const published = (id: number) =>
      branchRow(id, 2, {
        _status: 'published',
        submission: { ...branchSubmission(2), status: 'approved' },
      })
    const five = [...four, 205]
    const { run } = setup({
      brands: brand7,
      businesses: [source({ brand: 7 }), ...five.map(published)],
      partner: partnerRow([10, ...five]),
    })
    expect(await run()).toMatchObject({ ok: false, code: 'daily-limit' })
  })
})

describe("createBranch: the partner's listings are re-read before the write", () => {
  it('keeps a listing appended to the partner while the branch was being made', async () => {
    let shared: MemoryPayload | null = null
    const { payload, run } = setup({
      lock: async (_req, key) => {
        // Another save (staff in the admin, a publish) appends listing 55
        // after this request read the partner row. Not journaled: not ours.
        if (key.startsWith('vardenia.branches.brand:')) {
          ;(shared!.db['business-users']![0]!.businesses as number[]).push(55)
        }
      },
    })
    shared = payload
    const outcome = await run()
    if (!outcome.ok) throw new Error('expected ok')
    expect(payload.db['business-users']![0]!.businesses).toEqual([10, 30, 55, outcome.listingId])
  })
})

describe('createBranch: two requests at once', () => {
  const brand7 = [{ id: 7, name: 'Cafe Nour', slug: 'cafe-nour', published: true }]
  // No lock at all. With slowWrites, each write waits a macrotask, so the two
  // requests interleave between their count and their write.
  const noLock: Lock = async () => {}

  const atDailyBoundary = (lock: Lock) => {
    const four = [201, 202, 203, 204]
    return setup({
      brands: brand7,
      businesses: [
        source({ brand: 7 }),
        ...four.map((id) => ({
          id,
          name: `B${id}`,
          slug: `seed-${id}`,
          subcategories: ['restaurants'],
          brand: 7,
          _status: 'draft',
          createdAt: hoursAgo(2),
          submission: branchSubmission(2),
        })),
      ],
      partner: partnerRow([10, ...four]),
      lock,
      slowWrites: true,
    })
  }

  it('lets exactly one through at the fifth branch of the day', async () => {
    const { run } = atDailyBoundary(keyedMutex('vardenia.branches.partner:'))
    const results = await Promise.all([
      run(input({ name: 'Nour One' })),
      run(input({ name: 'Nour Two' })),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.code === 'daily-limit')).toHaveLength(1)
  })

  it('control: without the lock both get through (the test bites)', async () => {
    const { run } = atDailyBoundary(noLock)
    const results = await Promise.all([
      run(input({ name: 'Nour One' })),
      run(input({ name: 'Nour Two' })),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(2)
  })

  const atBrandBoundary = (lock: Lock) => {
    // Two different restaurants of brand 7, each managed by its own partner,
    // plus 17 more listings: 19 in all. Neither the partner nor the source
    // locks are shared, so only the brand lock can serialise the two requests.
    const members = Array.from({ length: 17 }, (_, i) => ({
      id: 100 + i,
      name: `Member ${i}`,
      slug: `seed-m${i}`,
      subcategories: ['restaurants'],
      brand: 7,
      _status: 'published',
      createdAt: hoursAgo(1000),
    }))
    const ctx = setup({
      brands: brand7,
      businesses: [
        source({ brand: 7 }),
        source({ id: 11, slug: 'cafe-nour-2', brand: 7, listingNumber: 15 }),
        ...members,
      ],
      partners: [
        partnerRow([10]),
        { id: 4, email: 'manager@example.com', name: 'Sami', businesses: [11] },
      ],
      lock,
      slowWrites: true,
    })
    const sami: BranchPartner = { id: 4, email: 'manager@example.com', name: 'Sami' }
    return { ...ctx, sami }
  }

  it('lets exactly one through at the twentieth listing of a brand, from two sources', async () => {
    const { run, sami } = atBrandBoundary(keyedMutex('vardenia.branches.brand:'))
    const results = await Promise.all([
      run(input({ name: 'Nour One' })),
      run(input({ name: 'Nour Two', sourceListingId: 11 }), sami),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.code === 'brand-full')).toHaveLength(1)
  })

  it('control: without the lock both get through', async () => {
    const { run, sami } = atBrandBoundary(noLock)
    const results = await Promise.all([
      run(input({ name: 'Nour One' })),
      run(input({ name: 'Nour Two', sourceListingId: 11 }), sami),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(2)
  })
})

describe('createBranch: no magazine number on a branch draft', () => {
  it('passes the real create hooks with no issue and no listing number', async () => {
    const { Businesses } = await import('../collections/Businesses')
    const { payload, run } = setup()
    await run()
    const create = payload.calls.find(
      (c) => c.op === 'create' && c.args.collection === 'businesses',
    )!
    let data = structuredClone(create.args.data) as Record<string, unknown>
    const context = { skipQrGeneration: true, skipAutoTranslate: true }
    const req = {
      context,
      payload: { find: async () => ({ docs: [] }), count: async () => ({ totalDocs: 0 }) },
    }
    const base = {
      operation: 'create',
      originalDoc: undefined,
      req,
      context,
      collection: Businesses,
    }
    for (const hook of [
      ...(Businesses.hooks?.beforeValidate ?? []),
      ...(Businesses.hooks?.beforeChange ?? []),
    ]) {
      const next = await (hook as (a: unknown) => unknown)({ ...base, data })
      if (next) data = next as Record<string, unknown>
    }
    expect(data.issue ?? null).toBeNull()
    expect(data.listingNumber ?? null).toBeNull()
    const top = Businesses.fields as { name?: string; defaultValue?: unknown }[]
    expect(top.find((f) => f.name === 'issue')?.defaultValue).toBeUndefined()
    expect(top.find((f) => f.name === 'listingNumber')?.defaultValue).toBeUndefined()
  })
})
