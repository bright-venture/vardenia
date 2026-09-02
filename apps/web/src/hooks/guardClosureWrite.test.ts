import { describe, expect, it } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'
import { guardClosureWrite } from './guardClosureWrite'

/**
 * Who may shut which restaurant.
 *
 * This hook exists because Payload's `create` access function is a boolean and
 * never sees the document being created, so the collection can answer "may this
 * account create a closure" and cannot answer "for which business". Everything
 * below is the half the collection cannot express, and the first case is the one
 * that would be a real incident: one partner closing another partner's venue for
 * the whole of August.
 */

type Args = Parameters<CollectionBeforeValidateHook>[0]

const owner = (businesses: (number | string)[]) => ({
  id: 7,
  collection: 'business-users',
  businesses,
})

const staff = { id: 1, collection: 'users', roles: ['staff'] }

const run = (args: {
  data: Record<string, unknown>
  user: unknown
  operation?: 'create' | 'update'
  originalDoc?: Record<string, unknown>
}) =>
  guardClosureWrite({
    data: args.data,
    req: { user: args.user },
    operation: args.operation ?? 'create',
    originalDoc: args.originalDoc,
  } as unknown as Args)

const valid = { business: 10, startsOn: '2026-08-14', endsOn: '2026-08-28' }

describe('who a closure may be written for', () => {
  it('lets an owner close a listing attached to their account', async () => {
    await expect(run({ data: { ...valid }, user: owner([10, 11]) })).resolves.toBeTruthy()
  })

  /** The incident this hook is here to prevent. */
  it("refuses an owner closing somebody else's listing", async () => {
    await expect(run({ data: { ...valid, business: 99 }, user: owner([10]) })).rejects.toThrow(
      /your own listings/i,
    )
  })

  it('refuses an owner with no listings at all', async () => {
    await expect(run({ data: { ...valid }, user: owner([]) })).rejects.toThrow(/your own listings/i)
  })

  it('refuses an anonymous caller', async () => {
    await expect(run({ data: { ...valid }, user: null })).rejects.toThrow(/your own listings/i)
  })

  /**
   * A customer's token validates perfectly well. `ownedBusinessIds` returns
   * empty for anything that is not a business user, and empty means "owns
   * nothing" rather than "owns everything".
   */
  it('refuses a customer', async () => {
    await expect(
      run({ data: { ...valid }, user: { id: 3, collection: 'customers' } }),
    ).rejects.toThrow(/your own listings/i)
  })

  it('lets staff write one for any listing, because they take these by phone', async () => {
    await expect(run({ data: { ...valid, business: 99 }, user: staff })).resolves.toBeTruthy()
  })

  it('refuses a closure that names no business', async () => {
    await expect(
      run({ data: { startsOn: '2026-08-14', endsOn: '2026-08-14' }, user: staff }),
    ).rejects.toThrow(/name a business/i)
  })

  /**
   * The other direction, and the one the collection's `Where` cannot catch: the
   * document being edited *is* theirs, so the update rule lets it through, and
   * the edit repoints it at a listing that is not.
   */
  it('refuses moving an existing closure to a different listing', async () => {
    await expect(
      run({
        data: { business: 99 },
        user: owner([10]),
        operation: 'update',
        originalDoc: { ...valid },
      }),
    ).rejects.toThrow(/different business/i)
  })

  /**
   * Same refusal even when the destination is theirs. A closure belongs to one
   * listing, and "you can only close your own listings" would be a baffling
   * thing to read while closing your own listing.
   */
  it('refuses the move even between two listings the same owner manages', async () => {
    await expect(
      run({
        data: { business: 11 },
        user: owner([10, 11]),
        operation: 'update',
        originalDoc: { ...valid },
      }),
    ).rejects.toThrow(/different business/i)
  })

  it('allows an ordinary edit that leaves the business alone', async () => {
    await expect(
      run({
        data: { endsOn: '2026-08-30' },
        user: owner([10]),
        operation: 'update',
        originalDoc: { ...valid },
      }),
    ).resolves.toBeTruthy()
  })
})

describe('the dates themselves', () => {
  it('accepts a single day, where the two ends are equal', async () => {
    await expect(
      run({
        data: { business: 10, startsOn: '2026-08-14', endsOn: '2026-08-14' },
        user: owner([10]),
      }),
    ).resolves.toBeTruthy()
  })

  /**
   * Refused rather than quietly swapped. A venue that typed the dates the wrong
   * way round should be told, not silently corrected into closing a week they
   * meant to stay open.
   */
  it('refuses a range that ends before it starts', async () => {
    await expect(
      run({
        data: { business: 10, startsOn: '2026-08-28', endsOn: '2026-08-14' },
        user: owner([10]),
      }),
    ).rejects.toThrow(/cannot be before/i)
  })

  it.each([
    ['a day that does not exist', '2026-02-31'],
    ['a month that does not exist', '2026-13-01'],
    ['a time as well as a day', '2026-08-14T00:00:00Z'],
    ['a different order', '14-08-2026'],
    ['an empty string', ''],
    ['a word', 'august'],
  ])('refuses %s', async (_label, startsOn) => {
    await expect(
      run({ data: { business: 10, startsOn, endsOn: '2026-08-28' }, user: owner([10]) }),
    ).rejects.toThrow(/real days/i)
  })
})
