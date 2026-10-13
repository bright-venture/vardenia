import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { OCCUPYING_STATUSES } from '@vardenia/core'
import { findEvery } from './find-every'

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
  /*
   * Signed out everywhere first, so no device can start a booking while the
   * rest of this runs. A booking request already in flight can still land; the
   * second cancellation pass at the end is for that one.
   */
  await revokeAllSessions(payload, customerId)

  const failures: string[] = []
  let cancelled = await cancelUpcoming(payload, customerId, now, failures)

  /*
   * Every booking, however many - this used to stop at the first 500, so a
   * customer with a long history kept notes ("nut allergy", "wheelchair") on
   * the rest after "closing" the account.
   */
  const withNotes = await findEvery<{ id: number | string }>(payload, {
    collection: 'bookings',
    where: { and: [{ customer: { equals: customerId } }, { notes: { exists: true } }] },
    depth: 0,
    overrideAccess: true,
    select: { notes: true },
  })
  for (const booking of withNotes.docs) {
    if (!(booking as { notes?: unknown }).notes) continue
    await payload
      .update({
        collection: 'bookings',
        id: booking.id,
        data: { notes: null },
        overrideAccess: true,
      })
      .catch(() => failures.push(`notes on booking ${String(booking.id)}`))
  }

  await payload
    .delete({
      collection: 'saved-listings',
      where: { customer: { equals: customerId } },
      overrideAccess: true,
    })
    .catch(() => failures.push('saved places'))

  /*
   * Nothing is anonymised while anything above failed. Reporting "closed" with
   * a live reservation or a note left behind is the one outcome worse than
   * failing: the person believes their data is gone. The account stays as it
   * was, signed out, and closing it again picks up where this stopped.
   */
  if (failures.length > 0) {
    throw new Error(
      `Account ${String(customerId)} was not closed: could not clear ${failures.join(', ')}.`,
    )
  }

  await payload.update({
    collection: 'customers',
    id: customerId,
    data: anonymisedCustomer(now),
    overrideAccess: true,
  })

  // A booking that raced the closure, made before the sessions went.
  cancelled += await cancelUpcoming(payload, customerId, now, [])

  return { cancelled, anonymised: true }
}

/**
 * Cancels every booking still ahead, however many. Failures are named in
 * `failures` for the caller to act on rather than swallowed.
 */
async function cancelUpcoming(
  payload: Payload,
  customerId: number | string,
  now: Date,
  failures: string[],
): Promise<number> {
  const upcoming = await findEvery<{ id: number | string }>(payload, {
    collection: 'bookings',
    where: {
      and: [
        { customer: { equals: customerId } },
        { status: { in: [...OCCUPYING_STATUSES] } },
        { end: { greater_than: now.toISOString() } },
      ],
    },
    depth: 0,
    overrideAccess: true,
  })

  let cancelled = 0
  for (const booking of upcoming.docs) {
    try {
      await payload.update({
        collection: 'bookings',
        id: booking.id,
        data: { status: 'cancelled' },
        overrideAccess: true,
        // No email to the customer, who cancelled these by closing the account
        // and whose address is about to stop existing. The venue is still told,
        // and the customer row is intact here, so it is told who is not coming.
        context: { closingAccount: true },
      })
      cancelled += 1
    } catch {
      failures.push(`booking ${String(booking.id)}`)
    }
  }
  return cancelled
}

/**
 * Ends every signed-in session the account still has, on every device.
 *
 * Changing the password does not do it. A login is a session id kept on the
 * account row, and the token in someone's cookie stays good for as long as its
 * id is still listed - so a closed account went on working in any browser that
 * was signed in when it closed, until that cookie expired a week later.
 *
 * The same write Payload's own "log out everywhere" makes: the row read
 * through the adapter, its sessions emptied, written back without touching
 * updatedAt.
 */
export async function revokeAllSessions(
  payload: Payload,
  customerId: number | string,
): Promise<void> {
  const row = await payload.db.findOne<{ id: number | string } & Record<string, unknown>>({
    collection: 'customers',
    where: { id: { equals: customerId } },
  })
  if (!row) return

  await payload.db.updateOne({
    collection: 'customers',
    id: customerId,
    data: { ...row, sessions: [], updatedAt: null },
    returning: false,
  })
}
