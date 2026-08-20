import type { CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'
import { closeCustomerAccount, isClosed } from '../lib/account-deletion'

/**
 * The admin panel's Delete button, made to do what closing an account does.
 *
 * A customer can close their own account from the website and it anonymises the
 * row rather than removing it - see lib/account-deletion for why. Staff clicking
 * Delete in the admin panel bypassed all of that and went straight at the row,
 * which is the same request arriving through a different door.
 *
 * It did not even fail cleanly. Payload points `bookings.customer` at customers
 * with `on delete set null`, but the field is required, so the column is
 * `not null` as well: Postgres tries to null it, the constraint rejects it, and
 * the admin gets "An unknown error has occurred" with no idea that the customer
 * has bookings. Same contradiction as blockMediaInUse, different table.
 *
 * # Staff need this, so it is not simply forbidden
 *
 * The obvious fix is to turn the button off. But the request that most needs
 * answering is "please delete my account" from somebody who cannot sign in to do
 * it themselves, and that is the one the law puts a clock on. Taking the
 * capability away from staff would mean it could not be honoured at all.
 *
 * # A customer nothing points at is genuinely deleted
 *
 * Anonymising exists to protect the venue's copy of a booking. With no bookings
 * there is no copy to protect, nothing references the row, and removing it
 * outright leaves less behind than a tombstone does. That is the better answer
 * whenever it is available - and it is the ordinary case for a sign-up that was
 * never used.
 */

/**
 * The closure deliberately runs outside the delete's transaction.
 *
 * `closeCustomerAccount` takes `payload` and no `req`, so every write inside it
 * opens and commits its own transaction. That is load-bearing rather than an
 * oversight: this hook throws immediately afterwards to call the delete off, and
 * Payload rolls its transaction back on the way out. Writes that had joined it
 * would be rolled back too - the account would report itself closed and still be
 * carrying the customer's name.
 *
 * So do not thread `req` through this call to tidy it up. There is a test in
 * lib/account-deletion.test.ts that fails if anybody does.
 */

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const closeRatherThanDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { payload } = req

  const bookings = await payload.find({
    collection: 'bookings',
    where: { customer: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  // Nothing holds on to this row. Let it go.
  if (bookings.totalDocs === 0) return

  const held = `The row stays because ${count(bookings.totalDocs, 'booking')} still ${
    bookings.totalDocs === 1 ? 'refers' : 'refer'
  } to it, and a booking is the venue's record as much as the customer's.`

  const existing = await payload.findByID({
    collection: 'customers',
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })

  /**
   * Closing twice would mint a second random address and move `deletedAt` to
   * today, quietly rewriting when it happened. Nothing identifying is left to
   * remove, so there is nothing to do but say so.
   */
  if (isClosed(existing)) {
    throw new APIError(
      `This account is already closed and nothing identifying is left on it. ${held}`,
      400,
    )
  }

  const outcome = await closeCustomerAccount(payload, id)

  /**
   * An error is the only way a beforeDelete hook can call the delete off, so the
   * message has to carry a result rather than a complaint. It says what was done
   * first, because it was done.
   */
  throw new APIError(
    `Account closed rather than deleted. Everything identifying has been removed` +
      (outcome.cancelled > 0
        ? `, and ${count(outcome.cancelled, 'upcoming booking')} cancelled with the venues told.`
        : '.') +
      ` ${held}`,
    400,
  )
}
