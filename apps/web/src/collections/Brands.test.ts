import { describe, expect, it, vi } from 'vitest'
import type { Access, CollectionBeforeOperationHook, FieldAccess } from 'payload'
import { ValidationError } from 'payload'
import { Brands, brandsRead } from './Brands'
import { Businesses } from './Businesses'
import { guardKindFields } from '../hooks/guardKindFields'
import { guardPartnerListingWrite } from '../hooks/guardPartnerListingWrite'
import { syncBrandPublished } from '../hooks/syncBrandPublished'

/**
 * Restaurant brands (Task 9): who reads and writes a brand, the `brand` field
 * of a listing, and the `published` mirror that public reads filter on.
 */

const admin = { id: 1, collection: 'users', roles: ['admin'] }
const staff = { id: 2, collection: 'users', roles: ['staff'] }
const partner = { id: 3, collection: 'business-users', businesses: [10] }
const customer = { id: 4, collection: 'customers' }
// A customer who somehow carries roles must still not pass as staff.
const sneaky = { id: 5, collection: 'customers', roles: ['admin'] }

const ctx = (user: unknown) => ({ req: { user } }) as unknown as Parameters<Access>[0]

type Loose = {
  name?: string
  type?: string
  relationTo?: string
  localized?: boolean
  unique?: boolean
  required?: boolean
  index?: boolean
  fields?: Loose[]
  tabs?: { label?: string; fields: Loose[] }[]
  access?: Record<string, FieldAccess>
  admin?: { condition?: (data: object) => boolean; readOnly?: boolean }
  validate?: (value: unknown, options: Record<string, unknown>) => unknown
}
const all = (fields: Loose[]): Loose[] =>
  fields.flatMap((f) => [
    f,
    ...(f.fields ? all(f.fields) : []),
    ...(f.tabs ? f.tabs.flatMap((tab) => all(tab.fields)) : []),
  ])
const brandField = (name: string) =>
  all(Brands.fields as unknown as Loose[]).find((f) => f.name === name)!

describe('brands: who reads', () => {
  it('lets staff read every brand', () => {
    expect(brandsRead(ctx(staff))).toBe(true)
    expect(brandsRead(ctx(admin))).toBe(true)
    expect(Brands.access?.read).toBe(brandsRead)
  })

  it.each([
    ['anonymous', null],
    ['a partner', partner],
    ['a customer', customer],
    ['a customer with roles', sneaky],
  ])('shows %s only brands with a published branch, as a query', (_label, user) => {
    expect(brandsRead(ctx(user))).toEqual({ published: { equals: true } })
  })
})

describe('brands: who writes', () => {
  const ops = ['create', 'update', 'delete'] as const

  it.each(ops)('%s is staff only', async (op) => {
    const rule = Brands.access?.[op] as Access
    expect(await rule(ctx(staff))).toBe(true)
    expect(await rule(ctx(admin))).toBe(true)
    for (const user of [null, partner, customer, sneaky]) {
      expect(await rule(ctx(user)), JSON.stringify(user)).toBe(false)
    }
  })
})

describe('brand fields', () => {
  it('has a localized name and description, a logo and a unique slug', () => {
    expect(brandField('name')).toMatchObject({ type: 'text', localized: true, required: true })
    expect(brandField('description')).toMatchObject({ localized: true })
    expect(brandField('logo')).toMatchObject({ type: 'upload', relationTo: 'media' })
    expect(brandField('slug')).toMatchObject({ type: 'text', unique: true, required: true })
  })

  it('keeps Payload required check on the slug', async () => {
    expect(brandField('slug').required).toBe(true)
  })
  it('makes `published` a mirror nobody writes through the API, staff included', () => {
    const field = brandField('published')
    expect(field.type).toBe('checkbox')
    expect(field.index).toBe(true)
    for (const user of [staff, admin, partner, null]) {
      expect(field.access?.create?.({ req: { user } } as never)).toBe(false)
      expect(field.access?.update?.({ req: { user } } as never)).toBe(false)
    }
  })

  it('populates into a listing as name, slug and logo only', () => {
    expect(Brands.defaultPopulate).toEqual({ name: true, slug: true, logo: true })
  })

  it('has no staff-only field a public read could reach', () => {
    // Every field is safe to show once the brand is public; if one is added
    // that is not, it must carry a read rule and this list must change.
    const names = all(Brands.fields as unknown as Loose[])
      .map((f) => f.name)
      .filter(Boolean)
    expect(names.sort()).toEqual(['description', 'logo', 'name', 'published', 'slug'])
  })
})

// ---------------------------------------------------------------------------
// The listing's `brand`
// ---------------------------------------------------------------------------

describe('the listing brand field', () => {
  const field = all(Businesses.fields as unknown as Loose[]).find((f) => f.name === 'brand')!

  it('is an optional relationship to brands', () => {
    expect(field).toMatchObject({ type: 'relationship', relationTo: 'brands', index: true })
    expect(field.required).not.toBe(true)
  })

  it('is written by staff only (the branch endpoint overrides access)', () => {
    for (const op of ['create', 'update'] as const) {
      expect(field.access?.[op]?.({ req: { user: staff } } as never)).toBe(true)
      for (const user of [partner, customer, sneaky, null]) {
        expect(field.access?.[op]?.({ req: { user } } as never)).toBe(false)
      }
    }
    // Public read: the brand page needs it.
    expect(field.access?.read).toBeUndefined()
  })

  it('is shown for restaurants only', () => {
    expect(field.admin?.condition?.({ subcategories: ['restaurants'] })).toBe(true)
    expect(field.admin?.condition?.({ subcategories: ['hotels'] })).toBe(false)
  })

  it('is refused by the partner guard', async () => {
    const promise = guardPartnerListingWrite({
      args: { id: 10, data: { brand: 7 }, overrideAccess: false },
      operation: 'update',
      overrideAccess: false,
      collection: Businesses as never,
      context: {},
      req: { user: partner, payload: { findByID: vi.fn(), find: vi.fn() } },
    } as unknown as Parameters<CollectionBeforeOperationHook>[0])
    await expect(promise).rejects.toMatchObject({ status: 400 })
    await expect(promise).rejects.toThrow(/brand/)
  })
})

describe('restaurants only (guardKindFields)', () => {
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    guardKindFields({
      data,
      originalDoc,
      operation: originalDoc ? 'update' : 'create',
      req: {},
      collection: Businesses,
      context: {},
    } as never)

  const brandError = (fn: () => unknown) => {
    try {
      fn()
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      const errors = (error as { data?: { errors?: { path: string; message: string }[] } }).data
        ?.errors
      return errors?.find((e) => e.path === 'brand')?.message ?? null
    }
    return null
  }

  it('allows a brand on a restaurant, on create and update', () => {
    expect(brandError(() => run({ subcategories: ['restaurants'], brand: 3 }))).toBeNull()
    expect(
      brandError(() => run({ brand: 3 }, { subcategories: ['restaurants'], brand: null })),
    ).toBeNull()
  })

  it('refuses a brand on another kind, on create', () => {
    expect(brandError(() => run({ subcategories: ['hotels'], brand: 3 }))).toMatch(
      /only for restaurants/,
    )
  })

  it('refuses a brand set on a stored non-restaurant (merged data)', () => {
    expect(brandError(() => run({ brand: { id: 3 } }, { subcategories: ['cafes'] }))).toMatch(
      /only for restaurants/,
    )
  })

  it('refuses turning a branded restaurant into another kind', () => {
    expect(
      brandError(() =>
        run({ subcategories: ['cafes'] }, { subcategories: ['restaurants'], brand: 3 }),
      ),
    ).toMatch(/only for restaurants/)
  })

  it('lets a non-restaurant clear a brand, and an unchanged form save pass', () => {
    expect(
      brandError(() => run({ brand: null }, { subcategories: ['cafes'], brand: 3 })),
    ).toBeNull()
    expect(
      brandError(() => run({ brand: 3, name: 'x' }, { subcategories: ['restaurants'], brand: 3 })),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The published mirror
// ---------------------------------------------------------------------------

describe('syncBrandPublished', () => {
  const harness = (publishedCount: Record<number, number>, current: Record<number, boolean>) => {
    const count = vi.fn(
      async ({ where }: { where: { and: Record<string, { equals: unknown }>[] } }) => {
        const brand = Number(where.and.find((c) => 'brand' in c)!.brand!.equals)
        return { totalDocs: publishedCount[brand] ?? 0 }
      },
    )
    const find = vi.fn(async ({ where }: { where: { id: { equals: number } } }) => {
      const id = where.id.equals
      return { docs: id in current ? [{ id, published: current[id] }] : [] }
    })
    const update = vi.fn(async () => ({}))
    const req = { payload: { count, find, update } }
    const run = (
      doc: Record<string, unknown>,
      previousDoc: Record<string, unknown> | undefined,
      operation: 'create' | 'update' = 'update',
    ) =>
      (syncBrandPublished as (a: unknown) => Promise<unknown>)({
        doc,
        previousDoc,
        operation,
        req,
        context: {},
        collection: Businesses,
      })
    return { count, find, update, req, run }
  }

  it('publishes a brand when its first branch is published', async () => {
    const h = harness({ 3: 1 }, { 3: false })
    await h.run({ id: 10, brand: 3, _status: 'published' }, { id: 10, brand: 3, _status: 'draft' })
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'brands',
        id: 3,
        data: { published: true },
        overrideAccess: true,
        req: h.req,
      }),
    )
    // Counts published, not-trashed branches (find hides the trash by itself).
    expect(JSON.stringify(h.count.mock.calls[0]![0])).toContain('"_status":{"equals":"published"}')
  })

  it('hides a brand when its last branch is unpublished or trashed', async () => {
    const h = harness({ 3: 0 }, { 3: true })
    await h.run(
      { id: 10, brand: 3, _status: 'published', deletedAt: '2026-11-21T00:00:00Z' },
      { id: 10, brand: 3, _status: 'published', deletedAt: null },
    )
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, data: { published: false } }),
    )
  })

  it('updates both brands when a listing moves', async () => {
    const h = harness({ 3: 0, 4: 1 }, { 3: true, 4: false })
    await h.run(
      { id: 10, brand: 4, _status: 'published' },
      { id: 10, brand: 3, _status: 'published' },
    )
    const ids = h.update.mock.calls.map((c) => (c as unknown as [{ id: number }])[0].id).sort()
    expect(ids).toEqual([3, 4])
  })

  it('writes nothing when the mirror is already right', async () => {
    const h = harness({ 3: 2 }, { 3: true })
    await h.run({ id: 10, brand: 3, _status: 'published' }, { id: 10, brand: 3, _status: 'draft' })
    expect(h.update).not.toHaveBeenCalled()
  })

  it('does nothing for a save that changes neither status, trash nor brand', async () => {
    const h = harness({}, {})
    await h.run(
      { id: 10, brand: 3, _status: 'published', name: 'b' },
      { id: 10, brand: 3, _status: 'published', name: 'a' },
    )
    await h.run({ id: 11, _status: 'published' }, { id: 11, _status: 'draft' })
    expect(h.count).not.toHaveBeenCalled()
  })

  it('recounts when a listing is deleted for good', async () => {
    const h = harness({ 3: 0 }, { 3: true })
    await (syncBrandPublished as (a: unknown) => Promise<unknown>)({
      doc: { id: 10, brand: 3, _status: 'published' },
      id: 10,
      req: h.req,
      context: {},
      collection: Businesses,
    })
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, data: { published: false } }),
    )
  })

  it('is wired after every listing save and delete', () => {
    expect(Businesses.hooks?.afterChange).toContain(syncBrandPublished)
    expect(Businesses.hooks?.afterDelete).toContain(syncBrandPublished)
  })
})

// ---------------------------------------------------------------------------
// The slug is permanent, run through the call shapes Payload uses
// ---------------------------------------------------------------------------

/**
 * One save of a brand's slug, as Payload 3.90 runs it: the collection's
 * beforeOperation hooks see the body as sent; then the field's beforeValidate
 * hook ({ value, originalDoc, data }); then the field's validate with the
 * options Payload passes (previousValue, siblingData, data, operation, id,
 * req, and the field's own config) - never `originalDoc`.
 */
async function saveSlug(opts: {
  operation: 'create' | 'update'
  body: Record<string, unknown>
  stored?: { id: number; slug: string; name?: string }
  id?: number
}): Promise<string | null> {
  const { operation, body, stored } = opts
  const find = vi.fn(async () => ({ docs: stored ? [stored] : [] }))
  const req = { user: staff, payload: { find } }
  try {
    for (const hook of Brands.hooks?.beforeOperation ?? []) {
      await hook({
        args: { id: opts.id ?? stored?.id, data: body, req },
        operation,
        collection: Brands,
        context: {},
        req,
      } as never)
    }
  } catch (error) {
    const errors = (error as { data?: { errors?: { message: string }[] } }).data?.errors
    return errors?.[0]?.message ?? (error as Error).message
  }
  const field = brandField('slug') as Loose & {
    hooks?: { beforeValidate?: ((a: Record<string, unknown>) => unknown)[] }
  }
  let value: unknown = body.slug
  for (const hook of field.hooks?.beforeValidate ?? []) {
    value = await hook({ value, originalDoc: stored, data: { ...stored, ...body }, operation, req })
  }
  const result = await field.validate!(value, {
    ...field,
    id: stored?.id,
    collectionSlug: 'brands',
    data: { ...(stored ?? {}), ...body, slug: value },
    event: 'submit',
    operation,
    overrideAccess: false,
    path: ['slug'],
    preferences: { fields: {} },
    previousValue: stored?.slug,
    req,
    siblingData: { ...(stored ?? {}), ...body, slug: value },
  })
  return result === true ? null : String(result)
}

describe('the brand slug is permanent once set', () => {
  const stored = { id: 3, slug: 'cafe-nour', name: 'Cafe Nour' }

  it('creates with a given slug, or one made from the name', async () => {
    expect(
      await saveSlug({ operation: 'create', body: { name: 'Cafe Nour', slug: 'cafe-nour' } }),
    ).toBeNull()
    expect(await saveSlug({ operation: 'create', body: { name: 'Cafe Nour' } })).toBeNull()
  })

  it('still requires a slug on create', async () => {
    expect(await saveSlug({ operation: 'create', body: { slug: '' } })).toMatch(/required/i)
  })

  it('lets an edit that leaves the slug alone, or resends it unchanged, through', async () => {
    expect(await saveSlug({ operation: 'update', body: { name: 'New name' }, stored })).toBeNull()
    expect(await saveSlug({ operation: 'update', body: { slug: 'cafe-nour' }, stored })).toBeNull()
  })

  it('refuses changing the slug of an existing brand', async () => {
    expect(await saveSlug({ operation: 'update', body: { slug: 'other' }, stored })).toMatch(
      /cannot change/,
    )
  })

  it('refuses clearing it', async () => {
    expect(await saveSlug({ operation: 'update', body: { slug: '' }, stored })).toMatch(
      /cannot change/,
    )
    expect(await saveSlug({ operation: 'update', body: { slug: null }, stored })).toMatch(
      /cannot change/,
    )
  })

  it('refuses a slug in an update by where', async () => {
    expect(
      await saveSlug({
        operation: 'update',
        body: { slug: 'x' },
        stored: undefined,
        id: undefined,
      }),
    ).toMatch(/cannot change/)
  })

  it('refuses a changed value at validate too (previousValue), whatever reached it', async () => {
    const validate = brandField('slug').validate!
    const options = (previousValue: unknown) => ({
      previousValue,
      siblingData: {},
      data: {},
      operation: 'update',
    })
    expect(await validate('other', options('cafe-nour'))).toMatch(/cannot change/)
    expect(await validate('cafe-nour', options('cafe-nour'))).toBe(true)
    expect(await validate('cafe-nour', options(undefined))).toBe(true)
  })
})
