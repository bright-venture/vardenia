import { getPayload } from 'payload'
import { fieldErrors, resetPasswordSchema } from '@vardenia/core'
import config from '../../../payload.config'
import { RATE_LIMIT, withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'

/**
 * Choosing a password from a reset link.
 *
 * Not `/api/customers/reset-password`, which would otherwise do. There is one
 * thing Payload's version does not do, and without it the most common path
 * through this feature is a dead end.
 *
 * # Completing a reset marks the address verified
 *
 * Payload's reset operation preserves `_verified` exactly as it found it. That
 * is wrong for us, because of how somebody arrives here:
 *
 *   1. They book a table as a guest. `findOrCreateCustomer` writes a customer
 *      row from the address they typed. Nobody has proven it, so it is
 *      unverified, and deliberately so.
 *   2. Later they sign up with the same address. `/auth/signup` sees the
 *      existing record and sends a reset rather than refusing - that is how the
 *      account holding their bookings gets claimed.
 *   3. They set a password here.
 *   4. They sign in, and `verify: true` refuses them with "check your email
 *      first" - about a verification mail that was never sent, because step 2
 *      sent a reset instead.
 *
 * They would be stuck permanently, holding a real booking. So the reset marks
 * the address verified, which is not a shortcut: the token was mailed to that
 * address and came back, which is the same proof a verification link provides.
 *
 * # No session is issued
 *
 * Payload's endpoint signs the caller in. This does not, and sends them to the
 * sign-in page instead. Typing a password they chose ten seconds ago is a small
 * cost, and it keeps cookie-minting out of a route reached with a token from an
 * email - the one request in the system most likely to have been forwarded,
 * logged by a mail scanner, or opened by somebody other than its owner.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const POST = withRateLimit(
  async (request: Request) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ ok: false, message: 'Expected a JSON body.' }, 400)
    }

    const parsed = resetPasswordSchema.safeParse(body)
    if (!parsed.success) {
      return json({ ok: false, errors: fieldErrors(parsed.error) }, 400)
    }

    const { token, password } = parsed.data
    const payload = await getPayload({ config })

    let userId: number | string
    try {
      const result = await payload.resetPassword({
        collection: 'customers',
        data: { token, password },
        overrideAccess: true,
      })
      userId = (result.user as { id: number | string }).id
    } catch {
      /**
       * One message for every failure, and a 400 rather than a 403.
       *
       * Payload distinguishes an unknown token from an expired one. Passing that
       * on would say whether a token ever existed, which is a small oracle but a
       * free one to close - and neither answer changes what the reader does next,
       * which is ask for a new link.
       */
      return json(
        { ok: false, message: 'That link is no longer valid. Please ask for a new one.' },
        400,
      )
    }

    try {
      await payload.update({
        collection: 'customers',
        id: userId,
        data: { _verified: true },
        overrideAccess: true,
      })
    } catch (error) {
      /**
       * Logged and swallowed. The password is already changed by this point, so
       * failing the request would tell the customer their reset did not work when
       * it did, and they would set it again to no effect. An account left
       * unverified is recoverable by staff; a customer who believes the reset
       * failed is not.
       */
      await reportError(error, {
        source: 'auth.reset.verification',
        path: '/auth/reset',
        extra: { userId },
      })
    }

    return json({ ok: true })
  },
  RATE_LIMIT.AUTH_PER_WINDOW,
  { shared: true },
)
