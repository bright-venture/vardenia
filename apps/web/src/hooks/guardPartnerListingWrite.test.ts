import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeOperationHook, CollectionConfig } from 'payload'
import { PARTNER_EDITABLE_FIELDS, STAFF_ONLY_LISTING_FIELDS } from '@vardenia/core'
import { Businesses } from '../collections/Businesses'
import { isStaff, staffOrOwnedListing } from '../access/index'
import { guardPartnerListingWrite } from './guardPartnerListingWrite'
import { dataFields } from '../lib/field-shape'
import type { Field } from 'payload'

/**
 * A partner editing their own listing (Task 3).
 *
 * The update access lets a business-user reach only their own rows; this hook
 * decides what they may say in them. Everything below runs the real hook
 * against the real Businesses config, with Payload's database calls stubbed:
 * `findByID` answers with the listing as saved, `find` with the media rows.
 */

type Args = Parameters<CollectionBeforeOperationHook>[0]

const partner = (id: number, businesses: (number | string)[]) => ({
  id,
  collection: 'business-users',
  businesses,
})
const staff = { id: 1, collection: 'users', roles: ['staff'] }
const customer = { id: 7, collection: 'customers' }

interface Media {
  id: number
  uploadedBy?: number | null
}

const run = (opts: {
  data: unknown
  user: unknown
  id?: number | string
  operation?: 'update' | 'create' | 'delete' | 'read'
  overrideAccess?: boolean
  /** The listing as saved. */
  saved?: Record<string, unknown>
  media?: Media[]
}) => {
  const findByID = vi.fn(async () => opts.saved ?? { id: opts.id ?? 10, heroImage: 1 })
  const find = vi.fn(async ({ where }: { where: { id: { in: (string | number)[] } } }) => ({
    docs: (opts.media ?? []).filter((m) => where.id.in.map(String).includes(String(m.id))),
  }))
  const args = {
    id: 'id' in opts ? opts.id : 10,
    data: opts.data,
    overrideAccess: opts.overrideAccess ?? false,
  }
  const promise = guardPartnerListingWrite({
    args,
    operation: opts.operation ?? 'update',
    overrideAccess: opts.overrideAccess ?? false,
    collection: Businesses as never,
    context: {},
    req: { user: opts.user, payload: { findByID, find } },
  } as unknown as Args)
  return { promise: Promise.resolve(promise), findByID, find, args }
}

const owner = partner(5, [10, 11])

describe('a partner editing their own listing', () => {
  it('saves an allow-listed field', async () => {
    const { promise, args } = run({ data: { name: 'Cafe Nour' }, user: owner })
    await expect(promise).resolves.toBe(args)
  })

  it('saves groups and arrays shaped like the listing', async () => {
    const { promise } = run({
      user: owner,
      data: {
        tagline: 'Coffee by the sea',
        contact: { phone: '+961 70 000 000', instagram: 'cafe_nour' },
        payments: { cash: true, card: false },
        openingHours: [
          { id: '65a1', day: 'mon', opens: '09:00', closes: '23:00', closed: false },
          { day: 'sun', closed: true },
        ],
        amenities: ['wifi'],
        seasonality: ['summer'],
        tags: ['sunset'],
        address: 'Main street',
        description: { root: { type: 'root', children: [] } },
      },
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it('accepts every name on the allow-list as a real listing field', async () => {
    for (const name of PARTNER_EDITABLE_FIELDS) {
      const { promise } = run({ data: { [name]: null }, user: owner })
      await expect(promise, name).resolves.toBeTruthy()
    }
  })
})

describe('address, map link and location', () => {
  it('saves an address, a map link and a [lng, lat] point', async () => {
    const { promise } = run({
      user: owner,
      data: {
        address: 'Main street',
        mapUrl: 'https://www.google.com/maps/@33.8938,35.5018,17z',
        location: [35.5018, 33.8938],
      },
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it('accepts a numeric-string point, as a form posts it', async () => {
    const { promise } = run({ user: owner, data: { location: ['35.5018', '33.8938'] } })
    await expect(promise).resolves.toBeTruthy()
  })

  it('clears them with null', async () => {
    const { promise } = run({ user: owner, data: { mapUrl: null, location: null } })
    await expect(promise).resolves.toBeTruthy()
  })

  it.each([
    [[35.5]],
    [[1, 2, 3]],
    [[35.5, 91]],
    [[181, 33.9]],
    [['x', 33.9]],
    [{ lat: 33.9, lng: 35.5 }],
    ['35.5,33.9'],
  ])('refuses the malformed point %j', async (location) => {
    const { promise } = run({ user: owner, data: { location } })
    await expect(promise).rejects.toMatchObject({ status: 400 })
  })

  /** The one rule for a point (Task 4b): within Lebanon, as isWithinLebanon. */
  it.each([
    [[2.35, 48.85]], // Paris
    [[33.8938, 35.5018]], // a Beirut point with longitude and latitude swapped
    [['2.35', '48.85']],
  ])('refuses the point %j, which is outside Lebanon', async (location) => {
    const { promise } = run({ user: owner, data: { location } })
    await expect(promise).rejects.toMatchObject({ status: 400 })
    await expect(run({ user: owner, data: { location } }).promise).rejects.toThrow(/Lebanon/)
  })
})

describe('what a partner may not send', () => {
  it.each(STAFF_ONLY_LISTING_FIELDS.map((name) => [name]))('refuses %s', async (name) => {
    const { promise } = run({ data: { name: 'Cafe', [name]: 'x' }, user: owner })
    await expect(promise).rejects.toMatchObject({ status: 400 })
    await expect(run({ data: { [name]: 'x' }, user: owner }).promise).rejects.toThrow(
      new RegExp(`"${name}"`),
    )
  })

  it.each([['priceRange'], ['area'], ['roomTypeList'], ['locationFromLink']])(
    'refuses %s, which is not on the allow-list',
    async (name) => {
      await expect(run({ data: { [name]: 'x' }, user: owner }).promise).rejects.toMatchObject({
        status: 400,
      })
    },
  )

  it('cannot publish or unpublish, even to the value it already has', async () => {
    for (const status of ['published', 'draft']) {
      await expect(run({ data: { _status: status }, user: owner }).promise).rejects.toMatchObject({
        status: 400,
      })
    }
  })

  it('refuses a field that does not exist at all', async () => {
    await expect(run({ data: { website: 'https://x.com' }, user: owner }).promise).rejects.toThrow(
      /"website"/,
    )
  })

  it('refuses a body that is not an object', async () => {
    for (const data of [null, 'name=x', ['name']]) {
      await expect(run({ data, user: owner }).promise).rejects.toMatchObject({ status: 400 })
    }
  })

  it('refuses a write that reaches into the trash', async () => {
    const promise = Promise.resolve(
      guardPartnerListingWrite({
        args: { id: 10, data: { name: 'Back' }, trash: true },
        operation: 'update',
        overrideAccess: false,
        collection: Businesses as never,
        context: {},
        req: { user: owner, payload: { findByID: vi.fn(), find: vi.fn() } },
      } as unknown as Args),
    )
    await expect(promise).rejects.toMatchObject({ status: 400 })
  })

  it('refuses an update of many listings at once', async () => {
    await expect(
      run({ data: { name: 'x' }, user: owner, id: undefined }).promise,
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('nested keys in a crafted REST body', () => {
  it('refuses a sub-key a group does not have', async () => {
    await expect(
      run({ data: { contact: { phone: '123456', website: 'https://x.com' } }, user: owner })
        .promise,
    ).rejects.toThrow(/"contact\.website"/)
  })

  it('refuses a staff field smuggled inside an allowed group', async () => {
    for (const smuggled of ['_status', 'tier', 'submission', 'verified']) {
      await expect(
        run({ data: { contact: { [smuggled]: 'x' } }, user: owner }).promise,
      ).rejects.toThrow(new RegExp(`"contact\\.${smuggled}"`))
    }
    await expect(
      run({ data: { payments: { cash: true, commission: { rate: 0 } } }, user: owner }).promise,
    ).rejects.toThrow(/"payments\.commission"/)
  })

  it('refuses an unknown key inside an array row', async () => {
    await expect(
      run({
        data: { openingHours: [{ day: 'mon', opens: '09:00', tier: 'gold' }] },
        user: owner,
      }).promise,
    ).rejects.toThrow(/"openingHours\.0\.tier"/)
  })

  it('refuses a group sent as something else', async () => {
    for (const contact of ['phone', ['phone'], 5]) {
      await expect(run({ data: { contact }, user: owner }).promise).rejects.toThrow(/"contact"/)
    }
    await expect(
      run({ data: { openingHours: { day: 'mon' } }, user: owner }).promise,
    ).rejects.toThrow(/"openingHours"/)
    await expect(run({ data: { openingHours: ['mon'] }, user: owner }).promise).rejects.toThrow(
      /"openingHours\.0"/,
    )
  })

  it('refuses a row id that is not a plain id', async () => {
    await expect(
      run({ data: { openingHours: [{ id: { $ne: 1 }, day: 'mon' }] }, user: owner }).promise,
    ).rejects.toThrow(/"openingHours\.0\.id"/)
  })

  it('refuses a media field sent as an object instead of an id', async () => {
    await expect(
      run({ data: { heroImage: { id: 3, uploadedBy: 5 } }, user: owner }).promise,
    ).rejects.toThrow(/"heroImage"/)
    await expect(run({ data: { gallery: [{ id: 3 }] }, user: owner }).promise).rejects.toThrow(
      /"gallery\.0"/,
    )
    await expect(run({ data: { logo: '1 or 1=1' }, user: owner }).promise).rejects.toThrow(/"logo"/)
  })
})

describe('whose listing', () => {
  it("refuses another partner's listing", async () => {
    const { promise, find } = run({ data: { name: 'Mine now' }, user: owner, id: 99 })
    await expect(promise).rejects.toMatchObject({ status: 403 })
    expect(find).not.toHaveBeenCalled()
  })

  it('refuses a partner with no listings', async () => {
    await expect(run({ data: { name: 'x' }, user: partner(6, []) }).promise).rejects.toMatchObject({
      status: 403,
    })
  })

  it('compares ids as strings, so a REST path id still matches', async () => {
    await expect(run({ data: { name: 'x' }, user: owner, id: '10' }).promise).resolves.toBeTruthy()
  })
})

describe('media a partner attaches', () => {
  const saved = { id: 10, heroImage: 1, gallery: [2, { id: 3 }], logo: null, menu: null }

  it('lets a partner attach what they uploaded', async () => {
    const { promise } = run({
      user: owner,
      saved,
      data: { heroImage: 20, gallery: [21, 22], logo: '23', menu: 24 },
      media: [20, 21, 22, 23, 24].map((id) => ({ id, uploadedBy: 5 })),
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it('keeps media already on the listing, whoever uploaded it', async () => {
    const { promise, find } = run({
      user: owner,
      saved,
      data: { gallery: [3, 2, 1], heroImage: 2 },
      media: [],
    })
    await expect(promise).resolves.toBeTruthy()
    expect(find).not.toHaveBeenCalled()
  })

  it.each(['heroImage', 'logo', 'menu'])("refuses another partner's media on %s", async (field) => {
    const { promise } = run({
      user: owner,
      saved,
      data: { [field]: 30 },
      media: [{ id: 30, uploadedBy: 6 }],
    })
    await expect(promise).rejects.toMatchObject({ status: 403 })
  })

  it("refuses another partner's media hidden in the gallery", async () => {
    const { promise } = run({
      user: owner,
      saved,
      data: { gallery: [2, 21, 30] },
      media: [
        { id: 21, uploadedBy: 5 },
        { id: 30, uploadedBy: 6 },
      ],
    })
    await expect(promise).rejects.toMatchObject({ status: 403 })
  })

  it('refuses team media that is not already on the listing', async () => {
    const { promise } = run({
      user: owner,
      saved,
      data: { logo: 40 },
      media: [{ id: 40, uploadedBy: null }],
    })
    await expect(promise).rejects.toMatchObject({ status: 403 })
  })

  it('refuses a media id that does not exist', async () => {
    const { promise } = run({ user: owner, saved, data: { menu: 999 }, media: [] })
    await expect(promise).rejects.toMatchObject({ status: 403 })
  })

  it('takes a customer with the uploader id for nobody', async () => {
    // uploadedBy only ever holds a business-user id; the check compares to the
    // partner's own id, so a matching number from elsewhere does not help.
    const { promise } = run({
      user: partner(6, [10]),
      saved,
      data: { menu: 50 },
      media: [{ id: 50, uploadedBy: 5 }],
    })
    await expect(promise).rejects.toMatchObject({ status: 403 })
  })
})

describe('everyone else is left to access control', () => {
  it('leaves staff exactly as before', async () => {
    const { promise, args, find, findByID } = run({
      user: staff,
      data: { tier: 'gold', _status: 'published', heroImage: 30, verified: true },
    })
    await expect(promise).resolves.toBe(args)
    expect(find).not.toHaveBeenCalled()
    expect(findByID).not.toHaveBeenCalled()
  })

  it("leaves the server's own writes alone (overrideAccess), even inside a partner's request", async () => {
    // ensureQrCode writes qrCode back with the partner's req after their save.
    const { promise } = run({ user: owner, data: { qrCode: 3 }, overrideAccess: true })
    await expect(promise).resolves.toBeTruthy()
  })

  it('does not touch reads, creates or deletes', async () => {
    for (const operation of ['read', 'create', 'delete'] as const) {
      const { promise } = run({ user: owner, data: { tier: 'gold' }, operation })
      await expect(promise).resolves.toBeTruthy()
    }
  })

  it('passes customers and anonymous callers to access, which refuses them', async () => {
    for (const user of [customer, null]) {
      await expect(run({ user, data: { name: 'x' } }).promise).resolves.toBeTruthy()
      const ctx = { req: { user } } as never
      expect(staffOrOwnedListing(ctx)).toBe(false)
    }
  })
})

describe('the Businesses collection is wired to it', () => {
  const config = Businesses as CollectionConfig
  const ctx = (user: unknown) => ({ req: { user } }) as never

  it('runs the guard before every operation', () => {
    expect(config.hooks?.beforeOperation).toContain(guardPartnerListingWrite)
  })

  it('lets a partner update only their own ids, as a query', () => {
    expect(config.access?.update).toBe(staffOrOwnedListing)
    expect(config.access?.update!(ctx(owner))).toEqual({ id: { in: [10, 11] } })
    expect(config.access?.update!(ctx(staff))).toBe(true)
    expect(config.access?.update!(ctx(customer))).toBe(false)
    expect(config.access?.update!(ctx(null))).toBe(false)
  })

  it('keeps create and delete with staff', () => {
    expect(config.access?.create).toBe(isStaff)
    expect(config.access?.delete).toBe(isStaff)
    expect(config.access?.delete!(ctx(owner))).toBe(false)
    expect(config.access?.create!(ctx(owner))).toBe(false)
  })
})

/**
 * The allow-list against the real config: a partner's edit goes live in
 * public, so every allowed field must be one the public already reads, with
 * no field-level rule (at any depth) keeping it from anonymous readers or from
 * a partner writing it.
 */
describe('the allow-list against the Businesses config', () => {
  const top = new Map(dataFields(Businesses.fields).map((f) => [f.name, f]))
  const anon = { req: { user: null } } as never
  const owner5 = { req: { user: owner } } as never

  const walk = (field: Field, path: string, out: string[]) => {
    const access = (field as { access?: Record<string, (a: never) => unknown> }).access
    if (access?.read && access.read(anon) !== true) out.push(`${path} is not public`)
    for (const op of ['update', 'create'] as const) {
      if (access?.[op] && access[op](owner5) !== true) out.push(`${path} denies a partner ${op}`)
    }
    const inner = (field as { fields?: Field[] }).fields
    if (inner) for (const sub of dataFields(inner)) walk(sub, `${path}.${sub.name}`, out)
  }

  it('names only real, public, partner-writable fields', () => {
    const problems: string[] = []
    for (const name of PARTNER_EDITABLE_FIELDS) {
      const field = top.get(name)
      if (!field) problems.push(`${name} is not a field`)
      else walk(field, name, problems)
    }
    expect(problems).toEqual([])
  })

  it('leaves out every field the team keeps that exists today', () => {
    for (const name of STAFF_ONLY_LISTING_FIELDS) {
      expect(PARTNER_EDITABLE_FIELDS as readonly string[]).not.toContain(name)
    }
    // And every field with a staff-only rule is on the staff list.
    const guarded = [...top.values()].filter((f) => {
      const access = (f as { access?: Record<string, (a: never) => unknown> }).access
      return access?.read && access.read(anon) !== true
    })
    for (const field of guarded) {
      expect(STAFF_ONLY_LISTING_FIELDS as readonly string[], field.name).toContain(field.name)
    }
  })
})

/**
 * Rich text is a field on the allow-list (description), and the editor keeps
 * Lexical's upload, relationship and link nodes. Each can point somewhere, so
 * the body is walked node by node (review fix, Task 3).
 */
describe('rich text a partner sends', () => {
  const text = (t: string) => ({
    type: 'text',
    text: t,
    format: 0,
    version: 1,
    detail: 0,
    mode: 'normal',
    style: '',
  })
  const paragraph = (...children: unknown[]) => ({
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    textFormat: 0,
    children,
  })
  const doc = (...children: unknown[]) => ({
    root: { type: 'root', version: 1, format: '', indent: 0, direction: 'ltr', children },
  })
  const upload = (value: unknown, relationTo = 'media') => ({
    type: 'upload',
    version: 3,
    format: '',
    id: '6650a1b2c3d4e5f6a7b8c9d0',
    fields: null,
    relationTo,
    value,
  })
  const link = (fields: Record<string, unknown>) => ({
    type: 'link',
    version: 3,
    format: '',
    indent: 0,
    direction: 'ltr',
    id: '6650a1b2c3d4e5f6a7b8c9d1',
    fields: { newTab: false, ...fields },
    children: [text('menu')],
  })
  const saved = { id: 10, heroImage: 1, description: doc(paragraph(text('old')), upload(2)) }

  it("refuses another partner's media placed in the description", async () => {
    const { promise } = run({
      user: owner,
      saved,
      data: { description: doc(paragraph(text('Our terrace')), upload(30)) },
      media: [{ id: 30, uploadedBy: 6 }],
    })
    await expect(promise).rejects.toMatchObject({ status: 403 })
  })

  it('refuses team media not already on the listing, even populated', async () => {
    const { promise } = run({
      user: owner,
      saved,
      data: { description: doc(upload({ id: 40, url: '/media/x.webp' })) },
      media: [{ id: 40, uploadedBy: null }],
    })
    await expect(promise).rejects.toMatchObject({ status: 403 })
  })

  it('accepts their own upload, and media the listing already shows', async () => {
    const { promise } = run({
      user: owner,
      saved,
      data: { description: doc(paragraph(text('Inside')), upload(21), upload(2)) },
      media: [{ id: 21, uploadedBy: 5 }],
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it('refuses an upload node pointing at another collection', async () => {
    await expect(
      run({ user: owner, saved, data: { description: doc(upload(3, 'receipts')) } }).promise,
    ).rejects.toThrow(/"description/)
  })

  it('refuses a relationship node', async () => {
    const node = {
      type: 'relationship',
      version: 2,
      format: '',
      relationTo: 'businesses',
      value: 99,
    }
    await expect(
      run({ user: owner, saved, data: { description: doc(paragraph(text('see')), node) } }).promise,
    ).rejects.toThrow(/"description/)
  })

  it('refuses an internal link to a document', async () => {
    const node = paragraph(
      link({ linkType: 'internal', doc: { relationTo: 'businesses', value: 99 } }),
    )
    await expect(
      run({ user: owner, saved, data: { description: doc(node) } }).promise,
    ).rejects.toMatchObject({ status: 400 })
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    '//evil.com',
    '/relative',
  ])('refuses a link to %s', async (url) => {
    const node = paragraph(link({ linkType: 'custom', url }))
    await expect(
      run({ user: owner, saved, data: { description: doc(node) } }).promise,
    ).rejects.toThrow(/"description/)
  })

  it('refuses an autolink with a bad url too', async () => {
    const node = paragraph({
      ...link({ linkType: 'custom', url: 'javascript:x' }),
      type: 'autolink',
    })
    await expect(
      run({ user: owner, saved, data: { description: doc(node) } }).promise,
    ).rejects.toMatchObject({ status: 400 })
  })

  it.each(['https://cafe.com/menu', 'http://cafe.com', 'mailto:info@cafe.com', 'tel:+96170000000'])(
    'accepts a link to %s',
    async (url) => {
      const node = paragraph(link({ linkType: 'custom', url }))
      await expect(
        run({ user: owner, saved, data: { description: doc(node) } }).promise,
      ).resolves.toBeTruthy()
    },
  )

  it('refuses rich text nested deeper than any editor makes', async () => {
    let node: Record<string, unknown> = text('deep')
    for (let i = 0; i < 200; i++) node = paragraph(node)
    await expect(
      run({ user: owner, saved, data: { description: doc(node) } }).promise,
    ).rejects.toMatchObject({ status: 400 })
  })

  it('leaves staff free to place any node', async () => {
    const node = {
      type: 'relationship',
      version: 2,
      format: '',
      relationTo: 'businesses',
      value: 99,
    }
    await expect(
      run({ user: staff, data: { description: doc(node, upload(30)) } }).promise,
    ).resolves.toBeTruthy()
  })
})

/**
 * Default-deny for rich text node types (re-review): a partner's description
 * may hold plain content and the checked upload and link nodes, nothing else.
 */
describe('rich text node types a partner may send', () => {
  const t = (text: string, format = 0) => ({
    type: 'text',
    text,
    format,
    version: 1,
    detail: 0,
    mode: 'normal',
    style: '',
  })
  const block = (type: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
    type,
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
    ...extra,
  })
  const state = (...children: unknown[]) => ({ root: block('root', children) })
  const send = (description: unknown) =>
    run({ user: owner, data: { description }, saved: { id: 10, heroImage: 1 } }).promise

  it('accepts an ordinary formatted description', async () => {
    const description = state(
      block('heading', [t('Our story')], { tag: 'h2' }),
      block(
        'paragraph',
        [
          t('Bold', 1),
          t(' and '),
          t('italic', 2),
          { type: 'linebreak', version: 1 },
          t('next line'),
        ],
        { textFormat: 0 },
      ),
      block('quote', [t('Best coffee in town')]),
      block(
        'list',
        [
          block('listitem', [t('Espresso')], { value: 1 }),
          block('listitem', [t('Cortado')], { value: 2 }),
        ],
        { listType: 'bullet', start: 1, tag: 'ul' },
      ),
      block('list', [block('listitem', [t('First')], { value: 1 })], {
        listType: 'number',
        start: 1,
        tag: 'ol',
      }),
    )
    await expect(send(description)).resolves.toBeTruthy()
  })

  it.each([['image'], ['mention'], ['customEmbed'], ['horizontalrule-x'], ['table']])(
    'refuses an unknown node type %s',
    async (type) => {
      await expect(send(state(block('paragraph', [{ type, version: 1 }])))).rejects.toThrow(
        /"description/,
      )
    },
  )

  it('refuses a node with no type', async () => {
    await expect(send(state(block('paragraph', [{ text: 'x' }])))).rejects.toMatchObject({
      status: 400,
    })
  })

  it('refuses a plain node that carries a relation', async () => {
    await expect(
      send(state(block('paragraph', [{ ...t('x'), relationTo: 'businesses', value: 9 }]))),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      send(state(block('paragraph', [t('x')], { value: { relationTo: 'media', value: 3 } }))),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('refuses a list item whose value is not a number', async () => {
    await expect(
      send(
        state(
          block('list', [block('listitem', [t('x')], { value: { id: 3 } })], {
            listType: 'bullet',
          }),
        ),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('refuses fields or a doc on a plain node', async () => {
    await expect(
      send(
        state(
          block('paragraph', [t('x')], { fields: { doc: { relationTo: 'businesses', value: 1 } } }),
        ),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('leaves staff free to send any node', async () => {
    await expect(
      run({ user: staff, data: { description: state({ type: 'customEmbed', value: 9 }) } }).promise,
    ).resolves.toBeTruthy()
  })
})

/** Hotel facilities (Task 5): hasMany selects, checked against their options. */
describe('hotel facilities a partner sends', () => {
  it('saves facilities, popular facilities and highlights as lists of valid slugs', async () => {
    const { promise } = run({
      user: owner,
      data: {
        facilities: ['free-wifi', 'bar', 'outdoor-pool'],
        popularFacilities: ['bar'],
        propertyHighlights: ['pool', 'quiet-location'],
      },
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it.each(['facilities', 'popularFacilities', 'propertyHighlights'])(
    'refuses an unknown slug in %s',
    async (name) => {
      const { promise } = run({ user: owner, data: { [name]: ['free-wifi', 'helipad'] } })
      await expect(promise).rejects.toMatchObject({ status: 400 })
    },
  )

  it('refuses a list that holds something other than a slug', async () => {
    for (const bad of [[{ slug: 'bar' }], [1], [['bar']], { 0: 'bar' }]) {
      const { promise } = run({ user: owner, data: { facilities: bad } })
      await expect(promise).rejects.toMatchObject({ status: 400 })
    }
  })

  it('refuses a highlight slug sent as a facility, and the reverse', async () => {
    const a = run({ user: owner, data: { facilities: ['quiet-location'] } })
    await expect(a.promise).rejects.toMatchObject({ status: 400 })
    const b = run({ user: owner, data: { propertyHighlights: ['free-wifi'] } })
    await expect(b.promise).rejects.toMatchObject({ status: 400 })
  })
})
