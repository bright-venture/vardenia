import { getPayload } from 'payload'
import { headers as nextHeaders } from 'next/headers'
import config from '../../../payload.config'
import { withRateLimit } from '../../../lib/rate-limit'
import { closeCustomerAccount } from '../../../lib/account-deletion'
import { reportError } from '../../../lib/report'
import { CUSTOMER_COLLECTION } from '../../../access/index'

/**
 * Closing your own account.
 *
 * The privacy policy and the terms both promise this, and until now it was a
 * job somebody did by hand. See lib/account-deletion for what actually happens
 * to the data - the short version is that the person is removed from the record
 * rather than the record from the database, because a booking belongs to the
 * venue as much as to the customer.
 *
 * # The password is asked for again
 *
 * A session cookie proves somebody has the browser, not that they are the
 * account holder. This is irreversible and it takes upcoming reservations with
 * it, which makes it the one action on the site worth a borrowed-laptop check.
 * Payload's `login` is used to verify rather than a comparison of our own, so
 * lockout and hashing stay in one place.
 *
 * # Not `/api/customers/:id` with a DELETE
 *
 * `delete` on the collection is admin-only and stays that way. A generic delete
 * would remove the row and either cascade the bookings away or fail on the
 * required relationship - and it would do nothing about the notes, which are the
 * most sensitive thing the customer ever wrote.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const POST = withRateLimit(async (request: Request) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, message: 'Expected a JSON body.' }, 400)
  }

  const password = (body as { password?: unknown })?.password
  if (typeof password !== 'string' || password.length === 0) {
    return json({ ok: false, message: 'Enter your password to close the account.' }, 400)
  }

  const payload = await getPayload({ config })

  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })

  const user = auth.user
  if (!user || user.collection !== CUSTOMER_COLLECTION) {
    return json({ ok: false, message: 'Sign in first.' }, 401)
  }

  const email = String((user as { email?: unknown }).email ?? '')

  try {
    await payload.login({ collection: 'customers', data: { email, password } })
  } catch {
    /**
     * Deliberately not distinguished from any other login failure. It is the
     * same answer a wrong password gets anywhere else, and a locked account must
     * not be described differently here just because the caller is already
     * signed in.
     */
    return json({ ok: false, message: 'That password is not right.' }, 403)
  }

  try {
    const outcome = await closeCustomerAccount(payload, user.id)

    /**
     * The count goes back so the page can say what happened. Somebody closing an
     * account with a table booked for Friday should be told the table went with
     * it, rather than discovering it when nobody is expecting them.
     */
    return json({ ok: true, cancelled: outcome.cancelled })
  } catch (error) {
    await reportError(error, {
      source: 'account.close',
      path: '/auth/delete',
      extra: { customer: user.id },
    })

    return json({ ok: false, message: 'We could not close the account. Please try again.' }, 500)
  }
})
