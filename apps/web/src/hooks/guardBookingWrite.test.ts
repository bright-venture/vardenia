import { describe, expect, it } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'
import { guardBookingWrite } from './guardBookingWrite'

/**
 * When a booking may still be called off.
 *
 * The account page offered "Cancel this booking" under a confirmed table from
 * the previous week, because the button asked what the status was and never what
 * the time was. Hiding the button would have been half a fix: it PATCHes
 * `/api/bookings/:id`, which anybody can send by hand, so the rule has to be
 * here as well as in the component.
 *
 * Only the timing rules are covered here. Who may move a booking to which status
 * is `canActorTransition`, tested in packages/core.
 */

type Args = Parameters<CollectionBeforeValidateHook>[0]

const customer = { id: 5, collection: 'customers' }
const owner = { id: 7, collection: 'business-users' }
const staff = { id: 1, collection: 'users', roles: ['staff'] }

const HOUR = 60 * 60 * 1000
const past = new Date(Date.now() - 24 * HOUR).toISOString()
const future = new Date(Date.now() + 24 * HOUR).toISOString()

const run = (args: {
  data: Record<string, unknown>
  user: unknown
  originalDoc: Record<string, unknown>
}) =>
  guardBookingWrite({
    data: args.data,
    req: { user: args.user },
    operation: 'update',
    originalDoc: args.originalDoc,
  } as unknown as Args)

/** A confirmed booking that ended yesterday, unless told otherwise. */
const booking = (over = true) => ({
  status: 'confirmed',
  customer: 5,
  business: 10,
  start: over ? past : future,
  end: over ? past : future,
})

describe('cancelling a booking that is already over', () => {
  it('refuses a customer cancelling a sitting that has ended', async () => {
    await expect(
      run({ data: { status: 'cancelled' }, user: customer, originalDoc: booking(true) }),
    ).rejects.toThrow(/already happened/i)
  })

  it('lets a customer cancel one that has not happened yet', async () => {
    await expect(
      run({ data: { status: 'cancelled' }, user: customer, originalDoc: booking(false) }),
    ).resolves.toBeTruthy()
  })

  /**
   * Voiding a booking after the fact is a venue correcting its own record, which
   * is a different act from a guest changing their mind.
   */
  it('still lets an owner void a booking after the fact', async () => {
    await expect(
      run({ data: { status: 'cancelled' }, user: owner, originalDoc: booking(true) }),
    ).resolves.toBeTruthy()
  })

  it('never limits staff, who repair records', async () => {
    await expect(
      run({ data: { status: 'cancelled' }, user: staff, originalDoc: booking(true) }),
    ).resolves.toBeTruthy()
  })

  /**
   * A write that does not touch the status is not a cancellation, so the clock
   * is irrelevant to it - otherwise a past booking could never be annotated.
   */
  it('leaves an unrelated edit to a past booking alone', async () => {
    await expect(
      run({ data: { notes: 'called ahead' }, user: staff, originalDoc: booking(true) }),
    ).resolves.toBeTruthy()
  })
})

/**
 * Moving a booking. Availability used to be checked on create only, so staff
 * editing the dates of a confirmed booking could double a table silently.
 */
describe('moving an existing booking', () => {
  /** Enough of Payload for the availability check: a listing and no bookings. */
  const payloadWith = (business: Record<string, unknown>) => {
    const calls: string[] = []
    return {
      calls,
      payload: {
        findByID: async () => {
          calls.push('businesses')
          return business
        },
        find: async ({ collection }: { collection: string }) => {
          calls.push(collection)
          return { docs: [] }
        },
      },
    }
  }

  const move = (args: {
    data: Record<string, unknown>
    user: unknown
    originalDoc: Record<string, unknown>
    payload: unknown
  }) =>
    guardBookingWrite({
      data: args.data,
      req: { user: args.user, payload: args.payload },
      operation: 'update',
      originalDoc: args.originalDoc,
    } as unknown as Args)

  const later = new Date(Date.now() + 72 * HOUR).toISOString()

  it('checks the new slot when staff move a confirmed booking', async () => {
    // A listing with bookings switched off: any check that runs must refuse.
    const { payload, calls } = payloadWith({ id: 10, booking: { enabled: false } })
    await expect(
      move({
        data: { start: later, end: later },
        user: staff,
        originalDoc: { ...booking(false), id: 3 },
        payload,
      }),
    ).rejects.toThrow()
    expect(calls).toContain('bookings')
  })

  it('refuses new dates on a booking that has already happened', async () => {
    const { payload, calls } = payloadWith({ id: 10 })
    await expect(
      move({
        data: { partySize: 6 },
        user: staff,
        originalDoc: { ...booking(true), id: 3, status: 'completed', partySize: 2 },
        payload,
      }),
    ).rejects.toThrow('can no longer change')
    expect(calls).toEqual([])
  })

  it('does not run the check for an edit that keeps the slot', async () => {
    const { payload, calls } = payloadWith({ id: 10 })
    const original = { ...booking(false), id: 3, partySize: 2 }
    await expect(
      move({
        data: { start: original.start, partySize: 2, internalNotes: 'x' },
        user: staff,
        originalDoc: original,
        payload,
      }),
    ).resolves.toBeTruthy()
    expect(calls).toEqual([])
  })

  /** Their dates are not writable at all; field access drops the change. */
  it('leaves a guest or venue date change to field access, without querying', async () => {
    const { payload, calls } = payloadWith({ id: 10 })
    for (const user of [customer, owner]) {
      await expect(
        move({
          data: { start: later },
          user,
          originalDoc: { ...booking(false), id: 3 },
          payload,
        }),
      ).resolves.toBeTruthy()
    }
    expect(calls).toEqual([])
  })
})
