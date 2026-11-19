import { describe, expect, it, vi } from 'vitest'
import { APIError, type Access } from 'payload'
import { isStaff } from '../access/index'
import { ListingRanges, nextFromDefault, validateRangeAgainstIssue } from './ListingRanges'
import { Issues, checkListingTotal } from './Issues'

const north = { governorate: 'north-lebanon', from: 80, to: 150 }

describe('validateRangeAgainstIssue', () => {
  it('refuses a range that overlaps another governorate', () => {
    const problem = validateRangeAgainstIssue({
      candidate: { governorate: 'keserwan', from: 1, to: 90 },
      others: [north],
      total: 408,
      held: [],
    })
    expect(problem).toMatch(/overlaps north-lebanon \(80-150\)/)
  })

  it('refuses to orphan a number a listing holds, naming it', () => {
    const problem = validateRangeAgainstIssue({
      candidate: { governorate: 'keserwan', from: 1, to: 90 },
      others: [],
      total: 408,
      held: [12, 95],
    })
    expect(problem).toContain('95')
    expect(problem).not.toContain('12,')
  })

  it('passes a clean range', () => {
    expect(
      validateRangeAgainstIssue({
        candidate: { governorate: 'north-lebanon', from: 91, to: 150 },
        others: [{ governorate: 'keserwan', from: 1, to: 90 }],
        total: 408,
        held: [100],
      }),
    ).toBeNull()
  })
})

describe('the ListingRanges collection', () => {
  it('is staff-only for every operation', () => {
    const a = ListingRanges.access!
    expect(a.read).toBe(isStaff)
    expect(a.create).toBe(isStaff)
    expect(a.update).toBe(isStaff)
    expect(a.delete).toBe(isStaff)
    expect(typeof (a.create as Access)).toBe('function')
  })

  it('allows one row per governorate per issue', () => {
    expect(ListingRanges.indexes).toContainEqual({ fields: ['issue', 'governorate'], unique: true })
  })

  it('is called listing-ranges, in the Magazine group', () => {
    expect(ListingRanges.slug).toBe('listing-ranges')
    expect(ListingRanges.admin?.group).toBe('Magazine')
  })
})

describe('the issue total', () => {
  it('is an integer defaulting to 408, minimum 1', () => {
    const f = Issues.fields.find((x) => 'name' in x && x.name === 'listingTotal') as {
      defaultValue: number
      min: number
    }
    expect(f.defaultValue).toBe(408)
    expect(f.min).toBe(1)
  })

  it('refuses a total below the highest range end', () => {
    expect(checkListingTotal(100, [{ to: 150 }])).toMatch(/150/)
    expect(checkListingTotal(150, [{ to: 150 }])).toBeNull()
    expect(checkListingTotal(10, [])).toBeNull()
  })
})

describe('the default for from', () => {
  const stub = (issues: unknown[], ranges: unknown[]) =>
    ({
      find: vi.fn(async ({ collection }: { collection: string }) => ({
        docs: collection === 'issues' ? issues : ranges,
      })),
    }) as never

  it('continues after the ranges of the latest issue', async () => {
    expect(
      await nextFromDefault(stub([{ id: 3 }], [{ governorate: 'keserwan', from: 1, to: 90 }])),
    ).toBe(91)
  })

  it('starts at 1 when the latest issue has no ranges', async () => {
    expect(await nextFromDefault(stub([{ id: 3 }], []))).toBe(1)
  })

  it('gives nothing when there is no issue or no payload', async () => {
    expect(await nextFromDefault(stub([], []))).toBeUndefined()
    expect(await nextFromDefault(undefined)).toBeUndefined()
  })
})

/**
 * The hooks themselves, through the collection config, with a stub payload that
 * records every query so the wiring (own row excluded, held numbers only on
 * update) is asserted rather than assumed.
 */
describe('the range hook', () => {
  const hook = ListingRanges.hooks!.beforeValidate![0] as (args: never) => Promise<unknown>
  const keserwan = { id: 7, issue: 1, governorate: 'keserwan', from: 1, to: 90 }

  const setup = (opts: { siblings?: unknown[]; held?: number[]; total?: number | null } = {}) => {
    const find = vi.fn(async ({ collection }: { collection: string }) => ({
      docs:
        collection === 'listing-ranges'
          ? (opts.siblings ?? [])
          : (opts.held ?? []).map((listingNumber) => ({ listingNumber })),
    }))
    const findByID = vi.fn(async (_args: unknown) => ({
      listingTotal: opts.total === undefined ? 408 : opts.total,
    }))
    return { find, findByID, req: { payload: { find, findByID } } }
  }
  const run = (
    s: ReturnType<typeof setup>,
    args: {
      data?: Record<string, unknown>
      originalDoc?: Record<string, unknown>
      operation: string
    },
  ) => hook({ ...args, req: s.req } as never)
  const rangeQuery = (s: ReturnType<typeof setup>) =>
    s.find.mock.calls.find(([a]) => a.collection === 'listing-ranges')![0] as unknown as {
      where: unknown
    }
  const businessQueries = (s: ReturnType<typeof setup>) =>
    s.find.mock.calls.filter(([a]) => a.collection === 'businesses')

  it('excludes its own row from the sibling query on update', async () => {
    const s = setup()
    await run(s, { data: { to: 95 }, originalDoc: keserwan, operation: 'update' })
    expect(JSON.stringify(rangeQuery(s).where)).toContain('{"id":{"not_equals":7}}')
  })

  it('does not exclude anything on create, and never looks for held numbers', async () => {
    const s = setup()
    await run(s, {
      data: { issue: 1, governorate: 'beirut', from: 1, to: 10 },
      operation: 'create',
    })
    expect(JSON.stringify(rangeQuery(s).where)).not.toContain('not_equals')
    expect(businessQueries(s)).toHaveLength(0)
  })

  it('loads held numbers on update', async () => {
    const s = setup()
    await run(s, { data: { to: 95 }, originalDoc: keserwan, operation: 'update' })
    expect(businessQueries(s)).toHaveLength(1)
  })

  it('does not report an unchanged range as overlapping itself', async () => {
    // The sibling query already omits the row, so only the others come back.
    const s = setup({ siblings: [{ governorate: 'north-lebanon', from: 91, to: 150 }] })
    await expect(
      run(s, { data: { from: 1, to: 90 }, originalDoc: keserwan, operation: 'update' }),
    ).resolves.toBeDefined()
  })

  it('still refuses a real overlap, with the message', async () => {
    const s = setup({ siblings: [north] })
    await expect(
      run(s, { data: { from: 1, to: 90 }, originalDoc: keserwan, operation: 'update' }),
    ).rejects.toThrow(/overlaps north-lebanon \(80-150\)/)
  })

  // A plain Error is a non-public 500: the admin shows "Something went wrong."
  it('refuses with a public 400, so staff read the reason', async () => {
    const s = setup({ siblings: [north] })
    const error = await run(s, {
      data: { from: 1, to: 90 },
      originalDoc: keserwan,
      operation: 'update',
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).isPublic).toBe(true)
    expect((error as APIError).message).toMatch(/overlaps north-lebanon \(80-150\)/)
  })

  it('refuses shrinking below a held number, naming it', async () => {
    const s = setup({ held: [95] })
    await expect(
      run(s, { data: { to: 90 }, originalDoc: keserwan, operation: 'update' }),
    ).rejects.toThrow(/95/)
  })

  it('accepts a populated issue object', async () => {
    const s = setup()
    await run(s, {
      data: { issue: { id: 4 }, governorate: 'beirut', from: 1, to: 10 },
      operation: 'create',
    })
    expect(s.findByID.mock.calls[0]![0]).toMatchObject({ collection: 'issues', id: 4 })
    expect(JSON.stringify(rangeQuery(s).where)).toContain('"equals":4')
  })

  it('fills a missing from after the other ranges', async () => {
    const s = setup({ siblings: [{ governorate: 'keserwan', from: 1, to: 90 }] })
    const data: Record<string, unknown> = { issue: 1, governorate: 'beirut', to: 120 }
    await run(s, { data, operation: 'create' })
    expect(data.from).toBe(91)
  })

  it('uses the default total when the issue has none', async () => {
    const s = setup({ total: null })
    await expect(
      run(s, {
        data: { issue: 1, governorate: 'beirut', from: 400, to: 408 },
        operation: 'create',
      }),
    ).resolves.toBeDefined()
    await expect(
      run(s, {
        data: { issue: 1, governorate: 'beirut', from: 400, to: 409 },
        operation: 'create',
      }),
    ).rejects.toThrow(/408/)
  })
})

describe('the issue hook', () => {
  const hook = Issues.hooks!.beforeValidate![0] as (args: never) => Promise<unknown>
  const stub = (ranges: unknown[]) => {
    const find = vi.fn(async (_args: unknown) => ({ docs: ranges }))
    return { find, req: { payload: { find } } }
  }

  it('refuses a total below the highest range end, as a public 400', async () => {
    const s = stub([{ to: 90 }, { to: 150 }])
    const error = await Promise.resolve(
      hook({ data: { listingTotal: 100 }, originalDoc: { id: 1 }, req: s.req } as never),
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).isPublic).toBe(true)
    expect((error as APIError).message).toMatch(/150/)
    expect(JSON.stringify(s.find.mock.calls[0]![0])).toContain('"equals":1')
  })

  it('accepts a total that covers the ranges', async () => {
    const s = stub([{ to: 150 }])
    await expect(
      hook({ data: { listingTotal: 408 }, originalDoc: { id: 1 }, req: s.req } as never),
    ).resolves.toBeDefined()
  })

  it('is skipped on create and when the total is not being set', async () => {
    const s = stub([{ to: 150 }])
    await hook({ data: { listingTotal: 1 }, req: s.req } as never)
    await hook({ data: { title: 'x' }, originalDoc: { id: 1 }, req: s.req } as never)
    expect(s.find).not.toHaveBeenCalled()
  })
})

/**
 * Deleting a range is the extreme case of shrinking it: every number it held
 * would belong to no range, and each of those listings would then fail its
 * next save with "This issue has no number range".
 */
describe('deleting a range', () => {
  const hook = (args: never) =>
    (ListingRanges.hooks?.beforeDelete?.[0] as (args: never) => Promise<unknown>)(args)
  const range = { id: 7, issue: { id: 1 }, governorate: 'keserwan', from: 1, to: 90 }

  const setup = (held: number[]) => {
    const findByID = vi.fn(async (_args: unknown) => range)
    const find = vi.fn(async (_args: unknown) => ({
      docs: held.map((listingNumber) => ({ listingNumber })),
    }))
    const req = { payload: { find, findByID } }
    return { find, findByID, req }
  }

  it('is refused while listings hold numbers in it, naming them', async () => {
    const s = setup([12, 40])
    const error = await hook({ id: 7, req: s.req } as never).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).isPublic).toBe(true)
    expect((error as APIError).message).toContain('12, 40')
    const query = JSON.stringify(s.find.mock.calls[0]![0])
    expect(query).toContain('"issue":{"equals":1}')
    expect(query).toContain('"governorate":{"equals":"keserwan"}')
    expect(s.findByID.mock.calls[0]![0]).toMatchObject({
      collection: 'listing-ranges',
      id: 7,
      req: s.req,
    })
  })

  it('is allowed when no listing holds a number in it', async () => {
    const s = setup([])
    await expect(hook({ id: 7, req: s.req } as never)).resolves.toBeUndefined()
  })
})
