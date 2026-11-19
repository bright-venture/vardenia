import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { PlaceSubmission } from '@vardenia/core'

vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))

import { reportError } from './report'
import { createPlaceSubmission, listNumbersFor, type SubmissionFiles } from './place-submission'

/**
 * The one public door that writes a listing. It writes with overrideAccess, so
 * these tests pin what it is willing to write and what it refuses first.
 */

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]

const file = (bytes: number[], type: string, name = 'a.jpg') =>
  new File([new Uint8Array(bytes)], name, { type })

const files = (): SubmissionFiles => ({
  hero: file(JPEG, 'image/jpeg', 'hero.jpg'),
  gallery: [file(PNG, 'image/png', 'g.png')],
  logo: file(WEBP, 'image/webp', 'logo.webp'),
})

const input = (over: Partial<PlaceSubmission> = {}): PlaceSubmission =>
  ({
    name: 'Cafe Nour',
    tagline: 'Good coffee',
    description: 'First line.\n\nSecond line.',
    category: 'eat-drink',
    subcategories: ['cafe'],
    governorate: 'beirut',
    district: undefined,
    area: undefined,
    address: 'Hamra St',
    openingHours: [],
    priceRange: undefined,
    amenities: ['wifi'],
    payments: { cash: true, card: false, whish: false, omt: false },
    publicPhone: '+9611',
    website: undefined,
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
}

/** A payload with one beirut range 10-20 in issue 7 and number 11 taken. */
function stub(
  opts: { range?: boolean; failListing?: unknown; failUpdate?: unknown } = {},
): Stub & Payload {
  let mediaId = 100
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
  const create = vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === 'media') return { id: mediaId++ }
    if (opts.failListing) throw opts.failListing
    return { id: 555 }
  })
  const update = vi.fn(async () => {
    if (opts.failUpdate) throw opts.failUpdate
    return { id: 555 }
  })
  return { find, create, update } as unknown as Stub & Payload
}

const created = (s: Stub, collection: string) =>
  s.create.mock.calls.map((c) => c[0]).filter((a) => a.collection === collection)

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

describe('createPlaceSubmission', () => {
  it('refuses a number outside the range, creating no media', async () => {
    const s = stub()
    const out = await createPlaceSubmission({
      payload: s,
      input: input({ listingNumber: 99 }),
      files: files(),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a number another listing holds, creating no media', async () => {
    const s = stub()
    const out = await createPlaceSubmission({
      payload: s,
      input: input({ listingNumber: 11 }),
      files: files(),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('refuses a governorate with no range', async () => {
    const s = stub({ range: false })
    const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
    expect(out).toMatchObject({ ok: false, code: 'no-range' })
    expect(s.create).not.toHaveBeenCalled()
  })

  it('writes only the allow-list, as a pending draft, in the owner locale', async () => {
    const s = stub()
    const out = await createPlaceSubmission({
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
      } as PlaceSubmission,
      files: files(),
    })
    expect(out).toEqual({ ok: true, listingId: 555 })

    const [listing] = created(s, 'businesses')
    expect(listing.overrideAccess).toBe(true)
    expect(listing.locale).toBe('ar')
    expect(listing.draft).toBeUndefined()
    expect(listing.context).toEqual({ skipQrGeneration: true, skipAutoTranslate: true })
    expect(Object.keys(listing.data).sort()).toEqual(
      [
        'name',
        'tagline',
        'description',
        'category',
        'subcategories',
        'governorate',
        'district',
        'area',
        'address',
        'openingHours',
        'priceRange',
        'amenities',
        'payments',
        'heroImage',
        'gallery',
        'logo',
        'issue',
        'listingNumber',
        '_status',
        'submission',
      ].sort(),
    )
    expect(listing.data._status).toBe('draft')
    expect(listing.data.heroImage).toBe(100)
    expect(listing.data.gallery).toEqual([101])
    expect(listing.data.logo).toBe(102)
    expect(listing.data.description.root.children).toHaveLength(2)
    expect(listing.data.submission).toMatchObject({
      status: 'pending',
      ownerName: 'Nour',
      ownerEmail: 'n@x.com',
      ownerPhone: '+9617',
      pageTemplate: 'a',
    })
    expect(Number.isNaN(Date.parse(listing.data.submission.submittedAt))).toBe(false)
  })

  it('also writes name and address (only) in the default locale for a non-default owner locale', async () => {
    const s = stub()
    await createPlaceSubmission({ payload: s, input: input({ locale: 'ar' }), files: files() })
    expect(s.update).toHaveBeenCalledTimes(1)
    const call = s.update.mock.calls[0]![0]
    expect(call).toMatchObject({
      collection: 'businesses',
      id: 555,
      locale: 'en',
      depth: 0,
      overrideAccess: true,
      data: { name: 'Cafe Nour', address: 'Hamra St' },
    })
    expect(Object.keys(call.data).sort()).toEqual(['address', 'name'])
    expect(call.context.skipAutoTranslate).toBe(true)
    expect(call.context.skipQrGeneration).toBe(true)
  })

  it('makes no second write when the owner wrote in the default locale', async () => {
    const s = stub()
    await createPlaceSubmission({ payload: s, input: input({ locale: 'en' }), files: files() })
    expect(s.update).not.toHaveBeenCalled()
  })

  it('still returns ok and reports when the default-locale write fails', async () => {
    vi.mocked(reportError).mockClear()
    const s = stub({ failUpdate: new Error('boom') })
    const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
    expect(out).toEqual({ ok: true, listingId: 555 })
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('creates media as supplied by the business, named after it, with access override', async () => {
    const s = stub()
    await createPlaceSubmission({ payload: s, input: input(), files: files() })
    const media = created(s, 'media')
    expect(media).toHaveLength(3)
    for (const m of media) {
      expect(m.overrideAccess).toBe(true)
      expect(m.data).toEqual({ alt: 'Cafe Nour', usageRights: 'supplied' })
    }
  })

  it('maps a unique refusal on (issue, listing_number) to number-unavailable', async () => {
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
    const out = await createPlaceSubmission({
      payload: stub({ failListing: refusal }),
      input: input(),
      files: files(),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
  })

  it('also maps the raw driver error naming the index', async () => {
    const raw = Object.assign(new Error('dup'), {
      cause: { code: '23505', constraint: 'businesses_issue_listing_number_idx' },
    })
    const out = await createPlaceSubmission({
      payload: stub({ failListing: raw }),
      input: input(),
      files: files(),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
  })

  it('does not call a unique refusal on some other column a taken number', async () => {
    const slug = Object.assign(new Error('Value must be unique'), {
      name: 'ValidationError',
      data: { errors: [{ message: 'x', path: 'slug', tableName: 'businesses' }] },
    })
    const out = await createPlaceSubmission({
      payload: stub({ failListing: slug }),
      input: input(),
      files: files(),
    })
    expect(out).toMatchObject({ ok: false, code: 'error' })
  })

  it('reports any other failure and leaks nothing', async () => {
    const out = await createPlaceSubmission({
      payload: stub({ failListing: new Error('connection to db.secret.internal refused') }),
      input: input(),
      files: files(),
    })
    expect(out).toEqual({
      ok: false,
      code: 'error',
      message: 'We could not save that. Please try again.',
    })
    expect(reportError).toHaveBeenCalled()
  })

  describe('files are checked before anything is created', () => {
    const refused = async (f: SubmissionFiles) => {
      const s = stub()
      const out = await createPlaceSubmission({ payload: s, input: input(), files: f })
      expect(out).toMatchObject({ ok: false, code: 'invalid-files' })
      if (!out.ok) expect(out.message.length).toBeGreaterThan(5)
      expect(s.create).not.toHaveBeenCalled()
    }

    it('refuses an oversized file', async () => {
      const big = file(JPEG, 'image/jpeg')
      Object.defineProperty(big, 'size', { value: 25 * 1024 * 1024 + 1 })
      await refused({ ...files(), hero: big })
    })

    it('refuses a type that Media allows but the form does not', async () => {
      await refused({ ...files(), hero: file(JPEG, 'image/avif') })
      await refused({ ...files(), gallery: [file(JPEG, 'application/pdf')] })
    })

    it('refuses a renamed file whose bytes are not an image', async () => {
      const fake = file([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0], 'image/jpeg')
      await refused({ ...files(), hero: fake })
    })

    it('refuses a declared type that disagrees with the bytes', async () => {
      await refused({ ...files(), hero: file(PNG, 'image/jpeg') })
    })

    it('refuses more than six gallery files', async () => {
      await refused({
        ...files(),
        gallery: Array.from({ length: 7 }, () => file(JPEG, 'image/jpeg')),
      })
    })

    it('refuses a missing hero and an empty file', async () => {
      await refused({ ...files(), hero: undefined as unknown as File })
      await refused({ ...files(), hero: file([], 'image/jpeg') })
    })

    it('accepts six gallery files', async () => {
      const s = stub()
      const out = await createPlaceSubmission({
        payload: s,
        input: input(),
        files: { ...files(), gallery: Array.from({ length: 6 }, () => file(JPEG, 'image/jpeg')) },
      })
      expect(out.ok).toBe(true)
    })
  })
})
