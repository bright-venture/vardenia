import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'
import { bookingsInTheWay, guardClosureWrite } from './guardClosureWrite'

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
  /** Live bookings the database holds for the listing; none unless given. */
  bookings?: Record<string, unknown>[]
  find?: ReturnType<typeof vi.fn>
}) =>
  guardClosureWrite({
    data: args.data,
    req: {
      user: args.user,
      payload: { find: args.find ?? vi.fn(async () => ({ docs: args.bookings ?? [] })) },
    },
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

/**
 * Closed dates over bookings that are still on. They used to be accepted and
 * the bookings left as they were, so guests turned up to a closed door. Now
 * the dates are refused, with the bookings named, until each is declined or
 * cancelled (which emails the guest).
 */
describe('closing days that already have bookings', () => {
  // 14 to 28 August 2026 in `valid`; Beirut is UTC+3 in August.
  const dinner = (reference: string, start: string, end: string, partySize = 4) => ({
    reference,
    start,
    end,
    partySize,
  })

  it('refuses, naming the booking, its time in Beirut and its party', async () => {
    const error = await run({
      data: { ...valid },
      user: owner([10]),
      bookings: [dinner('K3M9QP2X', '2026-08-15T17:00:00.000Z', '2026-08-15T19:00:00.000Z')],
    }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toMatch(/There is 1 booking on these dates/)
    expect(message).toContain('K3M9QP2X')
    expect(message).toContain('20:00')
    expect(message).toContain('4 people')
    expect(message).toMatch(/each guest is told by email/)
  })

  it('refuses for staff too, since the guests are the same guests', async () => {
    await expect(
      run({
        data: { ...valid },
        user: staff,
        bookings: [dinner('K3M9QP2X', '2026-08-15T17:00:00.000Z', '2026-08-15T19:00:00.000Z')],
      }),
    ).rejects.toThrow(/1 booking on these dates/)
  })

  it('counts a stay whose nights run into the closed days', async () => {
    // Checks in 12 August, out 16 August: the nights of the 14th and 15th are closed.
    await expect(
      run({
        data: { ...valid },
        user: owner([10]),
        bookings: [dinner('STAY0001', '2026-08-12T11:00:00.000Z', '2026-08-16T08:00:00.000Z', 2)],
      }),
    ).rejects.toThrow(/STAY0001/)
  })

  it('ignores a booking just outside the dates', async () => {
    // Checks out on the morning of the 14th: it has no night inside the closure.
    await expect(
      run({
        data: { ...valid },
        user: owner([10]),
        bookings: [dinner('LEAVES01', '2026-08-12T11:00:00.000Z', '2026-08-14T08:00:00.000Z', 2)],
      }),
    ).resolves.toBeTruthy()
  })

  it('asks only for pending or confirmed bookings that are not over yet', async () => {
    const find = vi.fn(async () => ({ docs: [] }))
    await run({ data: { ...valid }, user: owner([10]), find })
    const where = JSON.stringify((find.mock.calls[0] as unknown as [{ where: unknown }])[0].where)
    expect(where).toContain('"status":{"in":["pending","confirmed"]}')
    expect(where).toMatch(/"end":\{"greater_than":"\d{4}-/)
  })

  it('still lets a closure have only its note edited', async () => {
    const find = vi.fn(async () => ({ docs: [] }))
    await expect(
      run({
        data: { note: 'Private event' },
        user: owner([10]),
        operation: 'update',
        originalDoc: { ...valid },
        find,
      }),
    ).resolves.toBeTruthy()
    expect(find).not.toHaveBeenCalled()
  })

  it('lists five and counts the rest', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      reference: `REF0000${i}`,
      start: new Date('2026-08-15T17:00:00.000Z'),
      end: new Date('2026-08-15T19:00:00.000Z'),
      partySize: 1,
    }))
    const message = bookingsInTheWay(many)
    expect(message).toMatch(/^There are 7 bookings/)
    expect(message).toContain('1 person')
    expect(message).toContain('and 2 more')
    expect(message).not.toContain('REF00005')
  })
})
