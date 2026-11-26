import { describe, expect, it, vi } from 'vitest'
import { APIError } from 'payload'
import { isAdmin, isStaff } from '../access/index'
import {
  LOCKED_TEMPLATE_MESSAGE,
  Templates,
  checkTemplate,
  guardLockedTemplate,
  makeRefuseLockedDelete,
  templateSummary,
} from './Templates'

const page = (layout: string, id = `p-${layout}`) => ({ id, layout })
const pages = [page('full-spread', 'a'), page('full-page', 'b'), page('half-page', 'c')]

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

const change = (
  operation: 'create' | 'update',
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
) => guardLockedTemplate({ operation, data, originalDoc, req: {} } as never)

const validate = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
  checkTemplate({
    data,
    originalDoc,
    operation: originalDoc ? 'update' : 'create',
    req: {},
  } as never)

describe('a template that an issue uses (locked)', () => {
  const locked = { id: 4, name: 'Summer', pages, locked: true }

  it('refuses adding a page', async () => {
    await refused(
      change('update', { pages: [...pages, page('quarter-page', 'd')] }, locked),
      /Duplicate it/,
    )
  })

  it('refuses removing a page', async () => {
    await refused(change('update', { pages: pages.slice(0, 2) }, locked), /cannot be edited/)
  })

  it('refuses reordering pages', async () => {
    await refused(
      change('update', { pages: [pages[1], pages[0], pages[2]] }, locked),
      /used by an issue/,
    )
  })

  it('refuses changing the layout of a page', async () => {
    await refused(
      change('update', { pages: [pages[0], page('quarter-page', 'b'), pages[2]] }, locked),
      /cannot be edited/,
    )
  })

  it('says it in plain words', async () => {
    expect(LOCKED_TEMPLATE_MESSAGE).toBe(
      'This template is used by an issue and cannot be edited. Duplicate it to make a changed copy.',
    )
  })

  it('accepts a save that sends the same pages (the admin sends them all), or a new name', async () => {
    const same = { name: 'Summer 2027', pages: pages.map((p) => ({ ...p })) }
    await expect(change('update', same, locked)).resolves.toBe(same)
    const nameOnly = { name: 'Renamed' }
    await expect(change('update', nameOnly, locked)).resolves.toBe(nameOnly)
  })

  it('cannot be unlocked, even by a script', async () => {
    const data: Record<string, unknown> = { locked: false }
    await change('update', data, locked)
    expect(data.locked).toBe(true)
  })
})

describe('a template no issue uses', () => {
  it('allows changing its pages', async () => {
    const data = { pages: [page('quarter-page')] }
    await expect(change('update', data, { id: 4, pages, locked: false })).resolves.toBe(data)
  })

  it('is always created unlocked, so a duplicate comes out editable', async () => {
    const data: Record<string, unknown> = { name: 'Copy', pages, locked: true }
    await change('create', data)
    expect(data.locked).toBe(false)
  })

  it('has a locked field nobody can set through the API, reset on duplicate', () => {
    const f = Templates.fields.find((x) => 'name' in x && x.name === 'locked') as {
      access: { create: () => boolean; update: () => boolean }
      admin: { readOnly: boolean }
      hooks: { beforeDuplicate: ((a: never) => unknown)[] }
    }
    expect(f.access.update()).toBe(false)
    expect(f.access.create()).toBe(false)
    expect(f.admin.readOnly).toBe(true)
    expect(f.hooks.beforeDuplicate[0]!({ value: true } as never)).toBe(false)
  })
})

describe('the template pages', () => {
  it('refuses an empty template', async () => {
    await refused(validate({ name: 'x', pages: [] }), /at least one page/)
  })

  it('refuses emptying a stored template', async () => {
    await refused(validate({ pages: [] }, { id: 4, pages }), /at least one page/)
  })

  it('accepts a template with pages, and a save that does not send them', async () => {
    const data = { name: 'x', pages }
    await expect(validate(data)).resolves.toBe(data)
    const rename = { name: 'y' }
    await expect(validate(rename, { id: 4, pages })).resolves.toBe(rename)
  })

  it('needs at least one page in the admin too', () => {
    const f = Templates.fields.find((x) => 'name' in x && x.name === 'pages') as {
      type: string
      minRows: number
      required: boolean
      fields: { name: string; required: boolean; options: { value: string }[] }[]
    }
    expect(f.type).toBe('array')
    expect(f.minRows).toBe(1)
    expect(f.required).toBe(true)
    expect(f.fields[0]!.name).toBe('layout')
    expect(f.fields[0]!.required).toBe(true)
    expect(f.fields[0]!.options.map((o) => o.value)).toEqual([
      'full-spread',
      'full-page',
      'half-page',
      'three-third',
      'quarter-page',
    ])
  })
})

describe('deleting a template', () => {
  const run = (doc: Record<string, unknown> | null) => {
    const load = vi.fn(async () => doc)
    const hook = makeRefuseLockedDelete(load)
    return { promise: hook({ id: 4, req: {} } as never), load }
  }

  it('is refused while it is locked', async () => {
    const { promise, load } = run({ id: 4, locked: true })
    await refused(promise, /used by an issue/)
    expect(load).toHaveBeenCalledWith(4, expect.anything())
  })

  it('is allowed when it is not locked', async () => {
    await expect(run({ id: 4, locked: false }).promise).resolves.toBeUndefined()
  })
})

describe('the template summary', () => {
  it('adds up pages and listings and lists the slots', () => {
    const text = templateSummary(pages)
    expect(text).toMatch(/^4 pages, 4 listings\./)
    expect(text).toContain('1: Pages 1-2 (Full spread)')
    expect(text).toContain('2: Page 3 (Full page)')
    expect(text).toContain('3: Page 4, position 1 (Half page)')
    expect(text).toContain('4: Page 4, position 2 (Half page)')
  })

  it('is empty without pages', () => {
    expect(templateSummary([])).toBe('')
    expect(templateSummary(undefined)).toBe('')
  })
})

describe('the Templates collection', () => {
  it('is staff only, and only an admin deletes', () => {
    expect(Templates.slug).toBe('templates')
    expect(Templates.admin?.group).toBe('Magazine')
    expect(Templates.access?.read).toBe(isStaff)
    expect(Templates.access?.create).toBe(isStaff)
    expect(Templates.access?.update).toBe(isStaff)
    expect(Templates.access?.delete).toBe(isAdmin)
  })
})
