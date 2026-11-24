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
    address: 'Hamra St',
    openingHours: [],
    priceRange: undefined,
    amenities: ['wifi'],
    payments: { cash: true, card: false, whish: false, omt: false },
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
  delete: ReturnType<typeof vi.fn>
}

/** A payload with one beirut range 10-20 in issue 7 and number 11 taken. */
function stub(
  opts: {
    range?: boolean
    failListing?: unknown
    /** One error per listing create, in order; creates after the last succeed. */
    listingErrors?: unknown[]
    failUpdate?: unknown
  } = {},
): Stub & Payload {
  let mediaId = 100
  const listingErrors = [...(opts.listingErrors ?? [])]
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
    const next = listingErrors.shift()
    if (next) throw next
    return { id: 555 }
  })
  const update = vi.fn(async () => {
    if (opts.failUpdate) throw opts.failUpdate
    return { id: 555 }
  })
  const remove = vi.fn(async () => ({}))
  return { find, create, update, delete: remove } as unknown as Stub & Payload
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
        'contact',
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
    // The public contact is its own group; nothing public stays under the staff-only one.
    expect(listing.data.contact).toEqual({
      phone: '+9611',
      instagram: 'https://instagram.com/cafenour',
      facebook: undefined,
    })
    expect(listing.data.submission).not.toHaveProperty('publicPhone')
    expect(listing.data.submission).not.toHaveProperty('website')
  })

  it('never copies a smuggled website or other contact field', async () => {
    const s = stub()
    await createPlaceSubmission({
      payload: s,
      input: {
        ...input(),
        website: 'https://x.com',
        whatsapp: '+1',
        email: 'a@b.c',
      } as PlaceSubmission,
      files: files(),
    })
    const [listing] = created(s, 'businesses')
    expect(Object.keys(listing.data.contact).sort()).toEqual(['facebook', 'instagram', 'phone'])
    expect(listing.data).not.toHaveProperty('website')
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
    const out = await createPlaceSubmission({
      payload: stub({ failListing: refusal }),
      input: input(),
      files: files(),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(JSON.stringify(out)).not.toContain('Other')
  })

  it('also maps the raw driver error naming the index', async () => {
    const raw = Object.assign(new Error('dup'), {
      cause: { code: '23505', constraint: 'issue_listingNumber_idx' },
    })
    const out = await createPlaceSubmission({
      payload: stub({ failListing: raw }),
      input: input(),
      files: files(),
    })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
  })

  /**
   * The slug comes from the name, and the slug is unique, so a second "Cafe
   * Nour" (or two Arabic names that transliterate alike) used to fail for good.
   */
  describe('a name whose slug is taken', () => {
    // The two shapes a slug refusal arrives in: Payload's, where the adapter
    // maps the index businesses_slug_idx back to the field, and the raw one.
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
      const out = await createPlaceSubmission({
        payload: s,
        input: input({ name: 'Cafe Nour' }),
        files: files(),
      })
      expect(out).toEqual({ ok: true, listingId: 555 })
      const calls = listingCreates(s)
      expect(calls).toHaveLength(2)
      expect(calls[0].data).not.toHaveProperty('slug')
      expect(calls[1].data.slug).toBe('cafe-nour-12')
    })

    it('uses the transliterated name for an Arabic name', async () => {
      const s = stub({ listingErrors: [rawSlugTaken()] })
      await createPlaceSubmission({
        payload: s,
        input: input({ name: '\u0645\u0637\u0639\u0645' }),
        files: files(),
      })
      expect(listingCreates(s)[1].data.slug).toBe('mtam-12')
    })

    it('then adds four random hex characters, fresh each time', async () => {
      const s = stub({ listingErrors: [slugTaken(), slugTaken(), slugTaken()] })
      const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
      expect(out.ok).toBe(true)
      const slugs = listingCreates(s).map((c) => c.data.slug)
      expect(slugs).toHaveLength(4)
      expect(slugs[2]).toMatch(/^cafe-nour-12-[0-9a-f]{4}$/)
      expect(slugs[3]).toMatch(/^cafe-nour-12-[0-9a-f]{4}$/)
    })

    it('reuses the photos already stored: no new media on a retry', async () => {
      const s = stub({ listingErrors: [slugTaken(), slugTaken()] })
      await createPlaceSubmission({ payload: s, input: input(), files: files() })
      expect(created(s, 'media')).toHaveLength(3)
      for (const call of listingCreates(s)) {
        expect(call.data.heroImage).toBe(100)
        expect(call.data.gallery).toEqual([101])
        expect(call.data.logo).toBe(102)
      }
    })

    it('does not retry a taken listing number', async () => {
      const number = Object.assign(new Error('dup'), {
        cause: { code: '23505', constraint: 'issue_listingNumber_idx' },
      })
      const s = stub({ listingErrors: [number] })
      const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
      expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
      expect(listingCreates(s)).toHaveLength(1)
    })

    it('gives up after three retries with the generic error, and reports it', async () => {
      vi.mocked(reportError).mockClear()
      const s = stub({ failListing: slugTaken() })
      const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
      expect(out).toEqual({
        ok: false,
        code: 'error',
        message: 'We could not save that. Please try again.',
      })
      expect(listingCreates(s)).toHaveLength(4)
      expect(created(s, 'media')).toHaveLength(3)
      expect(reportError).toHaveBeenCalledTimes(1)
    })

    it('does not retry any other failure', async () => {
      const s = stub({ listingErrors: [new Error('boom')] })
      const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
      expect(out).toMatchObject({ ok: false, code: 'error' })
      expect(listingCreates(s)).toHaveLength(1)
    })
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

/**
 * A submission that fails after storing its photos deletes them again (21
 * November 2026). Before, they stayed in the media library with nothing using
 * them.
 */
describe('photos of a failed submission', () => {
  const deleted = (s: Stub) =>
    s.delete.mock.calls
      .map((c) => c[0])
      .filter((a) => a.collection === 'media')
      .map((a) => a.id)

  it('deletes all three photos when the number was lost in a race', async () => {
    const raw = Object.assign(new Error('dup'), {
      cause: { code: '23505', constraint: 'issue_listingNumber_idx' },
    })
    const s = stub({ failListing: raw })
    const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
    expect(out).toMatchObject({ ok: false, code: 'number-unavailable' })
    expect(deleted(s)).toEqual([100, 101, 102])
  })

  it('deletes them when the listing fails to save for any other reason', async () => {
    const s = stub({ failListing: new Error('database down') })
    const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
    expect(out).toMatchObject({ ok: false, code: 'error' })
    expect(deleted(s)).toEqual([100, 101, 102])
  })

  it('keeps them when the submission succeeds', async () => {
    const s = stub()
    const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
    expect(out).toMatchObject({ ok: true })
    expect(s.delete).not.toHaveBeenCalled()
  })

  it('still answers the owner when a photo cannot be deleted, and reports it', async () => {
    vi.mocked(reportError).mockClear()
    const s = stub({ failListing: new Error('database down') })
    s.delete.mockRejectedValue(new Error('storage down'))
    const out = await createPlaceSubmission({ payload: s, input: input(), files: files() })
    expect(out).toMatchObject({ ok: false, code: 'error' })
    expect(
      vi
        .mocked(reportError)
        .mock.calls.some(
          (c) => (c[1] as { source?: string })?.source === 'place-submission.cleanup',
        ),
    ).toBe(true)
  })
})
