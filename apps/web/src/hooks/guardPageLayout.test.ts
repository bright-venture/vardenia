import { describe, expect, it, vi } from 'vitest'
import { APIError } from 'payload'
import { buildSlots } from '@vardenia/core'
import { makeGuardPageLayout } from './guardPageLayout'

/** Slots 1-2 full page (pages 1-2), 3-4 half page (page 3), 5 full page (page 4). */
const slots = buildSlots([
  { layout: 'full-page' },
  { layout: 'full-page' },
  { layout: 'half-page' },
  { layout: 'full-page' },
])

function guardWith(issueSlots: unknown = slots) {
  const load = vi.fn(async () => issueSlots)
  const guard = makeGuardPageLayout(load)
  const run = (
    operation: 'create' | 'update',
    data: Record<string, unknown>,
    originalDoc?: Record<string, unknown>,
  ) =>
    guard({
      operation,
      data,
      originalDoc,
      req: { payload: {} },
      // Not a real hook argument: shows the guard does not look at it.
      overrideAccess: true,
      context: {},
    } as never)
  return { run, load }
}

const refused = async (p: unknown, pattern: RegExp) => {
  const error = await Promise.resolve(p).then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(APIError)
  expect((error as APIError).status).toBe(400)
  expect((error as Error).message).toMatch(pattern)
}

const stored = { id: 5, pageLayout: 'full-page', issue: 3, listingNumber: 1 }

describe('guardPageLayout: write once', () => {
  it('lets a create carry a layout, on a slot of that layout (the start route)', async () => {
    const { run, load } = guardWith()
    const data = { pageLayout: 'half-page', issue: 3, listingNumber: 4 }
    await expect(run('create', data)).resolves.toBe(data)
    expect(load).toHaveBeenCalledWith(3, expect.anything())
  })

  it('refuses an update that changes the layout, even with overrideAccess', async () => {
    const { run } = guardWith()
    await refused(run('update', { pageLayout: 'half-page' }, stored), /layout .*cannot be changed/i)
  })

  it('refuses an update that clears the layout', async () => {
    const { run } = guardWith()
    await refused(run('update', { pageLayout: null }, stored), /cannot be changed/i)
  })

  it('refuses setting a layout on a document that has none', async () => {
    const { run } = guardWith()
    await refused(
      run('update', { pageLayout: 'full-page' }, { id: 6, pageLayout: null, issue: 3 }),
      /cannot be changed/i,
    )
  })

  it('allows an update that sends the same layout, or none at all', async () => {
    const { run } = guardWith()
    const same = { pageLayout: 'full-page', name: 'x' }
    await expect(run('update', same, stored)).resolves.toBe(same)
    const without = { name: 'x' }
    await expect(run('update', without, stored)).resolves.toBe(without)
  })
})

describe('guardPageLayout: the number stays on a slot of its layout', () => {
  it('refuses moving the number to a slot of another layout, with a plain message', async () => {
    const { run, load } = guardWith()
    await refused(
      run('update', { listingNumber: 3 }, stored),
      /Number 3 is not a Full page slot in this issue\. This business bought Full page/,
    )
    expect(load).toHaveBeenCalledWith(3, expect.anything())
  })

  it('refuses a number past the last slot', async () => {
    const { run } = guardWith()
    await refused(run('update', { listingNumber: 99 }, stored), /Number 99 is not a Full page slot/)
  })

  it('allows another slot of the same layout', async () => {
    const { run } = guardWith()
    const data = { listingNumber: 5 }
    await expect(run('update', data, stored)).resolves.toBe(data)
  })

  it('checks the slots of the new issue when the issue changes', async () => {
    const { run, load } = guardWith(buildSlots([{ layout: 'half-page' }, { layout: 'full-page' }]))
    await refused(run('update', { issue: { id: 9 } }, stored), /Number 1 is not a Full page slot/)
    expect(load).toHaveBeenCalledWith(9, expect.anything())
    const moved = { issue: { id: 9 }, listingNumber: 3 }
    await expect(run('update', moved, stored)).resolves.toBe(moved)
  })

  it('refuses an issue that has no slots (no template)', async () => {
    const { run } = guardWith(null)
    await refused(run('update', { issue: 4 }, stored), /has no Full page slots/)
  })

  it('lets the number be released (rejected, trashed, lapsed)', async () => {
    const { run, load } = guardWith()
    const data = { listingNumber: null, deletedAt: '2026-11-26T00:00:00Z' }
    await expect(run('update', data, stored)).resolves.toBe(data)
    expect(load).not.toHaveBeenCalled()
  })

  it('does not look up anything when neither number nor issue changes', async () => {
    const { run, load } = guardWith()
    await run('update', { listingNumber: 1, issue: 3, name: 'x' }, stored)
    expect(load).not.toHaveBeenCalled()
  })

  it('leaves documents with no layout alone on issues without slots (legacy), and samples', async () => {
    const { run } = guardWith(null)
    const legacy = { listingNumber: 400, issue: 4 }
    await expect(run('update', legacy, { id: 8, issue: 3, listingNumber: 30 })).resolves.toBe(
      legacy,
    )
    const withSlots = guardWith()
    const sample = { listingNumber: null }
    await expect(
      withSlots.run('update', sample, {
        id: 9,
        isSample: true,
        pageLayout: null,
        listingNumber: null,
      }),
    ).resolves.toBe(sample)
    expect(withSlots.load).not.toHaveBeenCalled()
  })
})

describe('guardPageLayout: an issue with slots only takes numbers with a layout', () => {
  it('refuses a create with a number on a slotted issue and no layout (staff create)', async () => {
    const { run } = guardWith()
    await refused(
      run('create', { issue: 3, listingNumber: 1 }),
      /This issue sells listings by page layout.*no page layout/,
    )
  })

  it('refuses a create whose layout is not the layout of the slot', async () => {
    const { run } = guardWith()
    await refused(
      run('create', { pageLayout: 'full-page', issue: 3, listingNumber: 3 }),
      /Number 3 is not a Full page slot/,
    )
  })

  it('refuses giving a number on a slotted issue to a business with no layout', async () => {
    const { run } = guardWith()
    await refused(
      run('update', { listingNumber: 1 }, { id: 8, issue: 3, listingNumber: null }),
      /sells listings by page layout/,
    )
  })

  it('refuses moving a business with no layout and a number onto a slotted issue', async () => {
    const { run, load } = guardWith()
    await refused(
      run('update', { issue: 3 }, { id: 8, issue: 4, listingNumber: 30, pageLayout: null }),
      /sells listings by page layout/,
    )
    expect(load).toHaveBeenCalledWith(3, expect.anything())
  })

  it('leaves issues without slots (legacy) alone, on create and update', async () => {
    const { run } = guardWith(null)
    const create = { issue: 4, listingNumber: 30 }
    await expect(run('create', create)).resolves.toBe(create)
    const update = { listingNumber: 31 }
    await expect(run('update', update, { id: 8, issue: 4, listingNumber: 30 })).resolves.toBe(
      update,
    )
    const empty = guardWith([])
    await expect(empty.run('create', create)).resolves.toBe(create)
  })

  it('leaves businesses without a number alone (samples, unnumbered drafts)', async () => {
    const { run, load } = guardWith()
    const sample = { issue: 3, isSample: true, listingNumber: null }
    await expect(run('create', sample)).resolves.toBe(sample)
    const noNumber = { issue: 3 }
    await expect(run('create', noNumber)).resolves.toBe(noNumber)
    const moved = { issue: 3 }
    await expect(run('update', moved, { id: 8, issue: 4, listingNumber: null })).resolves.toBe(
      moved,
    )
    expect(load).not.toHaveBeenCalled()
  })
})
