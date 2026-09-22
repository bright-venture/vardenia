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
