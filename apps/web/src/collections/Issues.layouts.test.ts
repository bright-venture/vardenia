import { describe, expect, it, vi } from 'vitest'
import { APIError } from 'payload'
import { buildSlots } from '@vardenia/core'
import { isStaffFieldLevel } from '../access/index'
import {
  Issues,
  RANGES_FIRST_MESSAGE,
  makeCheckIssue,
  issueSlotList,
  makeSnapshotTemplate,
  toSlots,
  type IssueLookups,
} from './Issues'

const row = (layout: string, price: number | null, offered = true) => ({
  id: `row-${layout}`,
  layout,
  offered,
  price,
})

const valid = [
  row('full-spread', 3000),
  row('full-page', 1500),
  row('half-page', 800.5),
  row('three-third', null, false),
]

const templatePages = [
  { layout: 'full-spread' as const },
  { layout: 'full-page' as const },
  { layout: 'half-page' as const },
  { layout: 'quarter-page' as const },
]

/** Lookups that never touch a database. */
function lookupsWith(
  opts: {
    held?: Record<string, number>
    heldCount?: number
    ranges?: { to: number }[]
    templates?: Record<string, { layout: string }[] | null>
  } = {},
) {
  const lookups: IssueLookups = {
    ranges: vi.fn(async () => opts.ranges ?? []),
    heldByLayout: vi.fn(async () => opts.held ?? {}),
    heldCount: vi.fn(async () => opts.heldCount ?? 0),
    templatePages: vi.fn(
      async (id: number | string) => (opts.templates ?? { 11: templatePages })[String(id)] ?? null,
    ) as never,
    lockTemplate: vi.fn(
      async (id: number | string) => String(id) in (opts.templates ?? { 11: templatePages }),
    ) as never,
  }
  return lookups
}

const refused = async (p: unknown, pattern: RegExp) => {
  const error = await Promise.resolve()
    .then(() => p)
    .then(
      () => null,
      (e: unknown) => e,
    )
  expect(error).toBeInstanceOf(APIError)
  expect((error as APIError).status).toBe(400)
  expect((error as APIError).isPublic).toBe(true)
  expect((error as Error).message).toMatch(pattern)
}

describe('the Issues price table', () => {
  const runWith = (lookups: IssueLookups) => {
    const hook = makeCheckIssue(lookups)
    return (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
      hook({
        data,
        originalDoc,
        operation: originalDoc ? 'update' : 'create',
        req: { payload: {} },
      } as never)
  }

  it('accepts a valid table on create, without asking for held slots', async () => {
    const lookups = lookupsWith()
    const data = { layouts: valid }
    await expect(runWith(lookups)(data)).resolves.toBe(data)
    expect(lookups.heldByLayout).not.toHaveBeenCalled()
  })

  it('refuses a price below 1', async () => {
    await refused(
      runWith(lookupsWith())({ layouts: [row('full-page', 0)] }),
      /price must be a number of at least 1/,
    )
  })

  it('refuses a layout listed twice', async () => {
    await refused(
      runWith(lookupsWith())({ layouts: [row('full-page', 10), row('full-page', 20)] }),
      /more than once/,
    )
  })

  it('refuses switching off a layout that has held slots', async () => {
    const lookups = lookupsWith({ held: { 'full-page': 2 } })
    await refused(
      runWith(lookups)(
        { layouts: [row('full-page', 1500, false)] },
        { id: 7, layouts: [row('full-page', 1500)] },
      ),
      /Full page cannot be switched off or removed: 2 slots are held/,
    )
    expect(lookups.heldByLayout).toHaveBeenCalledWith(7, expect.anything())
  })

  it('refuses removing a layout that has held slots', async () => {
    await refused(
      runWith(lookupsWith({ held: { 'full-page': 1 } }))(
        { layouts: [] },
        { id: 7, layouts: [row('full-page', 1500)] },
      ),
      /cannot be switched off or removed: 1 slot is held/,
    )
  })

  it('lets a layout change price or switch off when nothing is held under it', async () => {
    const data = { layouts: [row('full-page', 2000), row('full-spread', 3000, false)] }
    await expect(
      runWith(lookupsWith({ held: { 'full-page': 1 } }))(data, {
        id: 7,
        layouts: [row('full-page', 1500), row('full-spread', 3000)],
      }),
    ).resolves.toBe(data)
  })

  it('still runs the listing total check against the listing ranges', async () => {
    await refused(
      runWith(lookupsWith({ ranges: [{ to: 150 }] }))(
        { listingTotal: 100 },
        { id: 7, listingTotal: 408 },
      ),
      /150/,
    )
  })

  it('leaves a save that touches neither layouts nor total alone', async () => {
    const lookups = lookupsWith()
    const data = { season: 'Summer' }
    await expect(
      runWith(lookups)(data, { id: 7, layouts: [row('full-page', 1500)] }),
    ).resolves.toBe(data)
    expect(lookups.heldByLayout).not.toHaveBeenCalled()
    expect(lookups.ranges).not.toHaveBeenCalled()
  })
})

describe('assigning a template to an issue', () => {
  const runWith = (lookups: IssueLookups) => {
    const hook = makeSnapshotTemplate(lookups)
    return (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
      hook({
        data,
        originalDoc,
        operation: originalDoc ? 'update' : 'create',
        req: { payload: {} },
      } as never)
  }
  const slots = buildSlots(templatePages)

  it('snapshots the slots and sets the listing total and pages', async () => {
    const data: Record<string, unknown> = { template: 11, listingTotal: 408, pageCount: 100 }
    await runWith(lookupsWith())(data)
    expect(data.slots).toEqual(slots)
    expect(data.listingTotal).toBe(8)
    expect(data.pageCount).toBe(5)
  })

  it('reads a populated template value too', async () => {
    const lookups = lookupsWith()
    const data: Record<string, unknown> = { template: { id: 11 } }
    await runWith(lookups)(data, { id: 7, template: null, slots: null })
    expect(lookups.templatePages).toHaveBeenCalledWith(11, expect.anything())
    expect(data.listingTotal).toBe(8)
  })

  it('refuses changing the template once a business holds a number in the issue', async () => {
    const lookups = lookupsWith({
      heldCount: 1,
      templates: { 11: templatePages, 12: [{ layout: 'full-page' }] },
    })
    await refused(
      runWith(lookups)({ template: 12 }, { id: 7, template: 11, slots }),
      /template cannot change: a business already holds a number/,
    )
    expect(lookups.heldCount).toHaveBeenCalledWith(7, expect.anything())
  })

  it('refuses removing the template once a business holds a number', async () => {
    await refused(
      runWith(lookupsWith({ heldCount: 2 }))({ template: null }, { id: 7, template: 11, slots }),
      /template cannot change/,
    )
  })

  it('refuses giving a legacy issue a template while it has held numbers', async () => {
    await refused(
      runWith(lookupsWith({ heldCount: 3 }))(
        { template: 11 },
        { id: 7, template: null, slots: null },
      ),
      /template cannot change/,
    )
  })

  it('allows changing the template while no number is held', async () => {
    const data: Record<string, unknown> = { template: 12 }
    await runWith(lookupsWith({ templates: { 12: [{ layout: 'full-page' }] } }))(data, {
      id: 7,
      template: 11,
      slots,
    })
    expect(data.slots).toEqual(buildSlots([{ layout: 'full-page' }]))
    expect(data.listingTotal).toBe(1)
    expect(data.pageCount).toBe(1)
  })

  it('refuses a template that cannot be found', async () => {
    await refused(
      runWith(lookupsWith({ templates: {} }))({ template: 99 }),
      /template was not found/,
    )
  })

  it('keeps the stored slots when the template does not change, whatever was sent', async () => {
    const lookups = lookupsWith()
    const data: Record<string, unknown> = { template: 11, slots: [], title: 'x' }
    await runWith(lookups)(data, { id: 7, template: 11, slots })
    expect(data.slots).toEqual(slots)
    expect(lookups.templatePages).not.toHaveBeenCalled()
    expect(lookups.heldCount).not.toHaveBeenCalled()
  })

  it('keeps the total and pages tied to the slots on a later save', async () => {
    const data: Record<string, unknown> = { listingTotal: 300 }
    await runWith(lookupsWith())(data, { id: 7, template: 11, slots, listingTotal: 8 })
    expect(data.listingTotal).toBe(8)
    expect(data.pageCount).toBe(5)
  })

  it('counts pages without listings in the page count, trailing ones included', async () => {
    const withBlanks = [
      { layout: 'no-listings' as const, note: 'Cover' },
      ...templatePages,
      { layout: 'no-listings' as const },
      { layout: 'no-listings' as const, note: 'Back cover' },
    ]
    const data: Record<string, unknown> = { template: 12 }
    await runWith(lookupsWith({ templates: { 12: withBlanks } }))(data)
    expect(data.slots).toEqual(buildSlots(withBlanks))
    expect((data.slots as { page: number }[])[0]!.page).toBe(2)
    expect(data.listingTotal).toBe(8)
    expect(data.pageCount).toBe(8)
  })

  it('keeps the stored page count on a later save when blank pages end the issue', async () => {
    const data: Record<string, unknown> = {}
    await runWith(lookupsWith())(data, { id: 7, template: 11, slots, pageCount: 7 })
    expect(data.pageCount).toBe(7)
    // A stored count below what the slots span is not trusted.
    const low: Record<string, unknown> = {}
    await runWith(lookupsWith())(low, { id: 7, template: 11, slots, pageCount: 2 })
    expect(low.pageCount).toBe(5)
  })

  it('leaves an issue without a template (legacy) alone', async () => {
    const lookups = lookupsWith()
    const data: Record<string, unknown> = { listingTotal: 300 }
    await runWith(lookups)(data, { id: 7, template: null, slots: null, listingTotal: 408 })
    expect(data).toEqual({ listingTotal: 300 })
    expect(lookups.templatePages).not.toHaveBeenCalled()
  })

  it('refuses assigning a template while the issue has a listing range', async () => {
    const lookups = lookupsWith({ ranges: [{ to: 20 }] })
    await refused(
      runWith(lookups)({ template: 11 }, { id: 7, template: null }),
      /Delete this issue's listing number ranges first, then choose the template, then enter the page blocks\./,
    )
    expect(lookups.lockTemplate).not.toHaveBeenCalled()
    expect(lookups.templatePages).not.toHaveBeenCalled()
  })

  it('refuses changing the template while the issue has a listing range, even with nothing held', async () => {
    await refused(
      runWith(
        lookupsWith({
          ranges: [{ to: 2 }],
          templates: { 11: templatePages, 12: [{ layout: 'full-page' }] },
        }),
      )({ template: 12 }, { id: 7, template: 11, slots }),
      /listing number ranges first/,
    )
    expect(RANGES_FIRST_MESSAGE).toMatch(/^Delete this issue/)
  })

  it('still lets the template be cleared while ranges exist and nothing is held', async () => {
    const lookups = lookupsWith({ ranges: [{ to: 2 }] })
    const data: Record<string, unknown> = { template: null }
    await runWith(lookups)(data, { id: 7, template: 11, slots })
    expect(data.slots).toBeNull()
    expect(lookups.lockTemplate).not.toHaveBeenCalled()
  })

  it('locks the template before reading its pages, with the same req', async () => {
    const lookups = lookupsWith()
    const order: string[] = []
    ;(lookups.lockTemplate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('lock')
      return true
    })
    ;(lookups.templatePages as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('read')
      return templatePages
    })
    const req = { payload: {} }
    const data: Record<string, unknown> = { template: 11 }
    await makeSnapshotTemplate(lookups)({
      data,
      originalDoc: { id: 7, template: null },
      operation: 'update',
      req,
    } as never)
    expect(order).toEqual(['lock', 'read'])
    expect(lookups.lockTemplate).toHaveBeenCalledWith(11, req)
    expect(lookups.templatePages).toHaveBeenCalledWith(11, req)
    expect(data.listingTotal).toBe(8)
  })

  it('locks on create too', async () => {
    const lookups = lookupsWith()
    await runWith(lookups)({ template: { id: 11 } })
    expect(lookups.lockTemplate).toHaveBeenCalledWith(11, expect.anything())
  })

  it('does not lock when a refusal comes first (numbers held)', async () => {
    const lookups = lookupsWith({ heldCount: 1 })
    await refused(
      runWith(lookups)({ template: 11 }, { id: 7, template: null }),
      /template cannot change/,
    )
    expect(lookups.lockTemplate).not.toHaveBeenCalled()
  })

  it('does not lock again when the template does not change', async () => {
    const lookups = lookupsWith()
    await runWith(lookups)({ template: 11, title: 'x' }, { id: 7, template: 11, slots })
    expect(lookups.lockTemplate).not.toHaveBeenCalled()
  })
})

describe('toSlots', () => {
  it('keeps well-formed slots and drops the rest', () => {
    const good = { number: 1, page: 1, position: null, layout: 'full-page' }
    expect(toSlots([good, { number: 'x' }, null, { ...good, layout: 'poster' }])).toEqual([good])
    expect(toSlots(null)).toEqual([])
  })
})

describe('the Issues template fields', () => {
  const named = (name: string) =>
    Issues.fields.find((f) => 'name' in f && f.name === name) as unknown as Record<string, unknown>

  it('links a template', () => {
    const t = named('template') as { type: string; relationTo: string }
    expect(t.type).toBe('relationship')
    expect(t.relationTo).toBe('templates')
  })

  it('stores staff-only slots that only the hook writes', () => {
    const s = named('slots') as {
      type: string
      access: { read: unknown; create: () => boolean; update: () => boolean }
    }
    expect(s.type).toBe('json')
    expect(s.access.read).toBe(isStaffFieldLevel)
    expect(s.access.create()).toBe(false)
    expect(s.access.update()).toBe(false)
  })

  it('has a staff-read price table with layout, offered and price only', () => {
    const f = named('layouts') as { type: string; access: { read: unknown }; fields: unknown[] }
    expect(f.type).toBe('array')
    expect(f.access.read).toBe(isStaffFieldLevel)
    const flat = (fields: unknown[]): Record<string, unknown>[] =>
      fields.flatMap((x) => {
        const field = x as { type: string; fields?: unknown[] }
        return field.type === 'row' ? flat(field.fields ?? []) : [field as Record<string, unknown>]
      })
    const sub = Object.fromEntries(flat(f.fields).map((x) => [x.name as string, x]))
    expect(Object.keys(sub).sort()).toEqual(['layout', 'offered', 'price'])
    expect((sub.layout as { required: boolean }).required).toBe(true)
    expect((sub.offered as { defaultValue: boolean }).defaultValue).toBe(false)
    expect((sub.price as { min: number }).min).toBe(1)
  })

  it('runs the hooks in order', () => {
    expect(Issues.hooks?.beforeValidate).toHaveLength(1)
    expect(Issues.hooks?.beforeChange).toHaveLength(1)
  })
})

/** The issue's slots as plain text in the admin (QA run 26 November 2026, LP-IS2). */
describe('issueSlotList', () => {
  it('lists every slot with its page and layout, one per line', () => {
    const slots = buildSlots([
      { layout: 'full-spread' },
      { layout: 'half-page' },
      { layout: 'three-third' },
    ])
    expect(issueSlotList(slots).split('\n')).toEqual([
      '1: Pages 1-2 (Full spread)',
      '2: Page 3, position 1 (Half page)',
      '3: Page 3, position 2 (Half page)',
      '4: Page 4, position 1 (1/3)',
      '5: Page 4, position 2 (1/3)',
      '6: Page 4, position 3 (1/3)',
    ])
  })

  it('is empty for an issue with no slots', () => {
    expect(issueSlotList(null)).toBe('')
    expect(issueSlotList([])).toBe('')
  })

  it('keeps the slots out of the editor and shows the plain list instead', () => {
    const fields = Issues.fields as Array<{
      name?: string
      admin?: { hidden?: boolean }
      virtual?: boolean
    }>
    expect(fields.find((f) => f.name === 'slots')?.admin?.hidden).toBe(true)
    expect(fields.find((f) => f.name === 'slotList')?.virtual).toBe(true)
  })
})
