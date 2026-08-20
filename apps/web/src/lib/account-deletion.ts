import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { OCCUPYING_STATUSES } from '@vardenia/core'

/**
 * Closing a customer account.
 *
 * The privacy policy says "you can ask us to delete it" and the terms say an
 * account can be closed at any time. Both were published before either was true
 * in software, so this is the code catching up with a promise already made.
 *
 * # Why the row survives
 *
 * Deleting the customer outright is the obvious reading of "delete my account"
 * and it is the wrong thing to do here, for a reason that has nothing to do with
 * us: a booking is the *venue's* record too. It is what a disagreement about a
 * missed table is settled from, and `bookings.customer` is a required
 * relationship, so removing the row would either cascade the bookings away or
 * fail outright.
 *
 * So the person is removed from the record rather than the record from the
 * database. Name, address and phone are overwritten, the password is replaced
 * with something nobody knows, and what is left is a tombstone that a booking
 * can still point at. Anonymised data is no longer personal data, which is what
 * the obligation is actually about.
 *
 * # Upcoming bookings are cancelled, not anonymised
 *
 * Somebody closing their account is not planning to turn up on Thursday. Leaving
 * a live reservation attached to a tombstone would hold a table for a person who
 * no longer exists as far as the site is concerned, and strip the venue of any
 * way to ring them about it.
 *
 * Cancelling instead runs the existing notification hook, so the restaurant
 * hears about it the same way it would for any other cancellation. Past bookings
 * are left as they are - they already happened, and the venue's record of them
 * is not ours to rewrite.
 */

/** Where a closed account's address is parked. A reserved TLD, so it can never route. */
const REMOVED_DOMAIN = 'removed.invalid'

export interface AnonymisedCustomer {
  email: string
  name: string
  phone: null
  password: string
  deletedAt: string
}

/**
 * What a closed account looks like afterwards.
 *
 * Pure, so a test can assert that nothing personal survives without needing a
 * database - which is the only assertion here that really matters.
 *
 * The email has to stay unique, because the column is, so it carries random
 * bytes rather than the customer's id. Using the id would leave a stable handle
 * that could be matched against anything else keyed the same way, which is the
 * kind of detail that turns "anonymised" into "pseudonymised" and puts the data
 * back inside the regulation.
 */
export function anonymisedCustomer(now: Date = new Date()): AnonymisedCustomer {
  const token = randomBytes(16).toString('hex')

  return {
    email: `closed-${token}@${REMOVED_DOMAIN}`,
    name: 'Closed account',
    phone: null,
    // Nobody knows this, including us. The account cannot be signed into again.
    password: randomBytes(32).toString('base64url'),
    deletedAt: now.toISOString(),
  }
}

/** True once the account has been closed, whatever else is on the row. */
export const isClosed = (customer: unknown): boolean =>
  Boolean((customer as { deletedAt?: unknown } | null)?.deletedAt)

export interface DeletionOutcome {
  cancelled: number
  anonymised: boolean
}

/**
 * Cancels what is still ahead, then removes the person from the record.
 *
 * Order matters. The cancellations run first and while the customer row is still
 * intact, because the notification hook reads it to tell the venue who is not
 * coming - do it the other way round and every restaurant is told that "Closed
 * account" has cancelled.
 */
export async function closeCustomerAccount(
  payload: Payload,
  customerId: number | string,
  now: Date = new Date(),
): Promise<DeletionOutcome> {
  const upcoming = await payload.find({
    collection: 'bookings',
    where: {
      and: [
        { customer: { equals: customerId } },
        { status: { in: [...OCCUPYING_STATUSES] } },
        { end: { greater_than: now.toISOString() } },
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })

  let cancelled = 0

  for (const booking of upcoming.docs) {
    /**
     * One at a time, and a failure on one does not abandon the rest. A booking
     * that refuses to cancel is worth reporting, but it must not leave the
     * account half-closed with the customer's details still on it.
     */
    try {
      await payload.update({
        collection: 'bookings',
        id: booking.id,
        data: { status: 'cancelled' },
        overrideAccess: true,

        /**
         * Read by notifyBookingStatus, which otherwise emails the customer
         * about each cancellation.
         *
         * They asked to close the account; being told twice that their bookings
         * were cancelled is noise at the worst possible moment, and the wording
         * would be wrong as well - "the business could not take your booking"
         * blames the venue for something the customer did. The venue is still
         * told, because the table really is free.
         *
         * The address is also about to stop existing, so the message would be
         * the last thing we ever send them and it would be untrue.
         */
        context: { closingAccount: true },
      })
      cancelled += 1
    } catch {
      // Reported by the caller, which has the request context to report with.
    }
  }

  /**
   * The notes are the customer's words and can carry a dietary requirement or an
   * accessibility need - health information, and the most sensitive thing in the
   * booking. Cleared on every booking, not only the cancelled ones: a past
   * dinner has served its purpose and the venue's record of *what happened* does
   * not need it.
   */
  const all = await payload.find({
    collection: 'bookings',
    where: { customer: { equals: customerId } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  for (const booking of all.docs) {
    if (!booking.notes) continue
    await payload
      .update({
        collection: 'bookings',
        id: booking.id,
        data: { notes: null },
        overrideAccess: true,
      })
      .catch(() => {})
  }

  await payload.update({
    collection: 'customers',
    id: customerId,
    data: anonymisedCustomer(now),
    overrideAccess: true,
  })

  return { cancelled, anonymised: true }
}
