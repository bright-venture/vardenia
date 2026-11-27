import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { VISIBLE_STATUSES, hoursLine, loadMagazine } from './magazine-view'

const SLOTS = [
  { number: 1, page: 2, position: null, layout: 'full-page' },
  { number: 2, page: 3, position: 1, layout: 'half-page' },
  { number: 3, page: 3, position: 2, layout: 'half-page' },
]

const business = (over: Record<string, unknown> = {}) => ({
  id: 99,
  listingNumber: 1,
  name: 'Cafe Nour',
  tagline: 'Good coffee',
  category: 'cafes',
  governorate: 'beirut',
  city: 'beirut',
  address: 'Hamra St',
  openingHours: [
    { day: 'mon', opens: '09:00', closes: '23:00', closed: false },
    { day: 'tue', opens: '09:00', closes: '23:00', closed: false },
    { day: 'wed', closed: true },
  ],
  contact: { phone: '+9611', email: 'secret@x.com' },
  description: { root: { children: [{ children: [{ text: 'Hello' }, { text: ' world' }] }] } },
  heroImage: {
    url: 'http://localhost:3000/api/media/file/a.jpg',
    sizes: { card: { url: '/api/media/file/a-card.webp', width: 800, height: 600 } },
  },
  owner: 7,
  submission: { status: 'pending', ownerEmail: 'owner@x.com', ownerPhone: '+9617' },
  isSample: false,
  ...over,
})

function fake(
  opts: {
    issue?: Record<string, unknown> | null
    template?: Record<string, unknown> | null
    ranges?: unknown[]
    businesses?: unknown[]
  } = {},
) {
  const issue =
    opts.issue === undefined
      ? { title: 'Summer', slots: SLOTS, pageCount: 4, template: 5 }
      : opts.issue
  const template =
    opts.template === undefined
      ? {
          pages: [
            { layout: 'no-listings', note: 'Cover' },
            { layout: 'full-page' },
            { layout: 'half-page' },
            { layout: 'no-listings', note: 'Back cover' },
          ],
        }
      : opts.template
  const find = vi.fn(async ({ collection }: { collection: string }) => ({
    docs:
      collection === 'listing-ranges'
        ? (opts.ranges ?? [{ governorate: 'beirut', firstPage: 2, lastPage: 3, from: 1, to: 3 }])
        : (opts.businesses ?? [business()]),
  }))
  const findByID = vi.fn(async ({ collection }: { collection: string }) =>
    collection === 'issues' ? issue : template,
  )
  return { payload: { find, findByID } as unknown as Payload, find, findByID }
}

describe('loadMagazine', () => {
  it('returns the issue, its pages with the template notes, and its regions', async () => {
    const { payload } = fake()
    const data = await loadMagazine(payload, 7, 'en')
    if ('problem' in data) throw new Error('unexpected')
    expect(data.issue).toEqual({ id: 7, title: 'Summer' })
    expect(data.pages).toEqual([
      { page: 1, kind: 'editorial', note: 'Cover' },
      {
        page: 2,
        kind: 'listings',
        layout: 'full-page',
        span: 1,
        slots: [{ number: 1, position: null }],
      },
      {
        page: 3,
        kind: 'listings',
        layout: 'half-page',
        span: 1,
        slots: [
          { number: 2, position: 1 },
          { number: 3, position: 2 },
        ],
      },
      { page: 4, kind: 'editorial', note: 'Back cover' },
    ])
    expect(data.regions).toEqual([{ governorate: 'beirut', firstPage: 2, lastPage: 3 }])
  })

  it('has a null note for an editorial page the template does not describe', async () => {
    const { payload } = fake({
      template: { pages: [{ layout: 'no-listings' }, { layout: 'full-page' }] },
    })
    const data = await loadMagazine(payload, 7, undefined)
    if ('problem' in data) throw new Error('unexpected')
    expect(data.pages[0]).toEqual({ page: 1, kind: 'editorial', note: null })
  })

  it('exposes exactly the whitelisted keys, with no owner or id data', async () => {
    const { payload } = fake()
    const data = await loadMagazine(payload, 7, 'en')
    if ('problem' in data) throw new Error('unexpected')
    const [b] = data.businesses
    expect(Object.keys(b as object).sort()).toEqual(
      [
        'number',
        'name',
        'tagline',
        'category',
        'governorate',
        'address',
        'hours',
        'phone',
        'description',
        'photoUrl',
      ].sort(),
    )
    expect(b).toMatchObject({
      number: 1,
      phone: '+9611',
      description: 'Hello world',
      hours: 'Mon-Tue 09:00-23:00, Wed closed',
      photoUrl: '/api/media/file/a-card.webp',
    })
    const all = JSON.stringify(data)
    for (const leak of ['secret@x.com', 'owner@x.com', '+9617', 'submission', '"id":99']) {
      expect(all).not.toContain(leak)
    }
  })

  it('returns only the five visible statuses, never samples', async () => {
    const statuses = [
      ...VISIBLE_STATUSES,
      'incomplete',
      'abandoned',
      'lapsed',
      'rejected',
      'expired',
    ]
    const businesses = statuses.map((status, i) =>
      business({ listingNumber: i + 1, submission: { status } }),
    )
    businesses.push(business({ listingNumber: 50, isSample: true }))
    businesses.push(business({ listingNumber: 51, submission: undefined }))
    const { payload } = fake({ businesses })
    const data = await loadMagazine(payload, 7, 'en')
    if ('problem' in data) throw new Error('unexpected')
    expect(data.businesses.map((b) => b.number)).toEqual([1, 2, 3, 4, 5])
  })

  it('asks the database for the same rule, read with server access', async () => {
    const { payload, find } = fake()
    await loadMagazine(payload, 7, 'ar')
    const call = find.mock.calls.find(
      ([a]) => (a as { collection: string }).collection === 'businesses',
    )![0] as unknown as Record<string, unknown>
    expect(call.overrideAccess).toBe(true)
    expect(call.locale).toBe('ar')
    expect(JSON.stringify(call.where)).toContain('awaiting_downpayment')
    expect(JSON.stringify(call.where)).toContain('isSample')
  })

  it('draws a business with no photo, description or hours as empty strings and a null photo', async () => {
    const { payload } = fake({
      businesses: [
        business({
          heroImage: null,
          description: null,
          openingHours: [],
          contact: null,
          tagline: null,
        }),
      ],
    })
    const data = await loadMagazine(payload, 7, 'en')
    if ('problem' in data) throw new Error('unexpected')
    expect(data.businesses[0]).toMatchObject({
      photoUrl: null,
      description: '',
      hours: '',
      phone: '',
      tagline: '',
    })
  })

  it('answers not-found for an unknown issue and no-slots for one without slots', async () => {
    expect(await loadMagazine(fake({ issue: null }).payload, 7, 'en')).toEqual({
      problem: 'not-found',
    })
    expect(
      await loadMagazine(
        fake({ issue: { title: 'Old', slots: null, pageCount: 40 } }).payload,
        7,
        'en',
      ),
    ).toEqual({ problem: 'no-slots' })
  })

  it('still builds pages when the issue has no template', async () => {
    const { payload } = fake({ issue: { title: 'S', slots: SLOTS, pageCount: 4, template: null } })
    const data = await loadMagazine(payload, 7, 'en')
    if ('problem' in data) throw new Error('unexpected')
    expect(data.pages[0]).toEqual({ page: 1, kind: 'editorial', note: null })
  })
})

describe('hoursLine', () => {
  it('is empty when not set', () => {
    expect(hoursLine(undefined)).toBe('')
    expect(hoursLine([])).toBe('')
  })
})
