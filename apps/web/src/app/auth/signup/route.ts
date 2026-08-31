import { getPayload } from 'payload'
import { fieldErrors, signupSchema } from '@vardenia/core'
import config from '../../../payload.config'
import { RATE_LIMIT, withRateLimit } from '../../../lib/rate-limit'
import { clientIp } from '../../../lib/scan-guard'
import { verifyTurnstile } from '../../../lib/turnstile'
import { reportError } from '../../../lib/report'

/**
 * Opening a customer account from the site.
 *
 * Not `/api/customers`. Payload mounts a create endpoint there for every
 * collection, it accepts whatever the caller sends, and Payload 3 has no global
 * rate limit to put in front of it - so the collection keeps `create: isStaff`
 * and this is the public door. Same arrangement as bookings.
 *
 * Login, logout, forgot-password and reset are Payload's own endpoints under
 * `/api/customers/...` and are fine as they are: none of them creates anything,
 * and `maxLoginAttempts` with `lockTime` already guards the one that guesses.
 *
 * # /auth, not /account
 *
 * This was at /account/signup, which is the URL the sign-up *page* should own.
 * They cannot share it: the intl middleware rewrites page paths into the locale
 * tree, so whichever one is not excluded gets swallowed. `/auth/*` is JSON and
 * excluded, `/account/*` is pages and localized. See middleware.ts, which also
 * explains why none of these endpoints was reachable before that file was fixed.
 *
 * # Every outcome looks identical from outside
 *
 * Success, "that address already has an account", and "that address booked as a
 * guest once" all return the same 202 and the same sentence. Anything else is an
 * account enumeration oracle: post an address, read the response, learn whether
 * that person has an account here. For a directory whose customers book hotels
 * and clinics, that is a real disclosure and not a theoretical one.
 *
 * What differs is which email gets sent:
 *
 *  - new address        -> account created, Payload sends the verification mail
 *  - unclaimed record   -> a password reset, which is how a guest booker claims
 *                          the record already carrying their bookings
 *  - existing account   -> a password reset, which is what someone who has
 *                          forgotten they signed up actually needs
 *
 * The last two are the same branch, because telling them apart is exactly the
 * disclosure being avoided.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** One sentence, whatever happened. */
const CHECK_YOUR_EMAIL =
  'Check your email. If we can open an account for that address, a message is on its way.'

export const POST = withRateLimit(
  async (request: Request) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ ok: false, message: 'Expected a JSON body.' }, 400)
    }

    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      return json({ ok: false, errors: fieldErrors(parsed.error) }, 400)
    }

    /**
     * Turnstile, before anything is looked up or written.
     *
     * Placed here rather than deeper because a refused request should cost one
     * call to Cloudflare and no database round trip at all.
     *
     * It is checked after schema parsing on purpose: a malformed body is a 400
     * whatever the token says, and spending a Cloudflare verification on
     * something already known to be invalid helps nobody.
     *
     * Returns 403 rather than 400 because the submission is well-formed and was
     * refused - the form has to tell those apart to know whether to reset the
     * widget. Does nothing at all until TURNSTILE_SECRET_KEY is set; see
     * lib/turnstile for why that is the safe direction.
     */
    const verdict = await verifyTurnstile(
      (body as { turnstileToken?: unknown }).turnstileToken,
      clientIp(request.headers),
    )
    if (!verdict.ok) {
      return json(
        {
          ok: false,
          code: verdict.reason,
          message: 'We could not confirm you are a person. Please try again.',
        },
        403,
      )
    }

    const { email, name, password, phone } = parsed.data
    const payload = await getPayload({ config })

    const existing = await payload.find({
      collection: 'customers',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      /**
       * Deliberately not updated with the submitted name, phone or password.
       *
       * This request is unauthenticated and the address is unproven, so anything
       * it writes would be a stranger editing somebody else's record - and setting
       * the password would be handing them the account outright. The reset link
       * goes to the address itself, which is the only thing here that proves
       * anything.
       */
      await payload
        .forgotPassword({
          collection: 'customers',
          data: { email },
          disableEmail: false,
        })
        .catch(async (error) => {
          /**
           * Silent to the caller by design, and the caller is the person it hurts:
           * they were told a message is on its way and it is not, so they are
           * locked out of an account that already holds their bookings.
           */
          await reportError(error, { source: 'auth.signup.reset-email', path: '/auth/signup' })
        })

      return json({ ok: true, message: CHECK_YOUR_EMAIL }, 202)
    }

    try {
      await payload.create({
        collection: 'customers',
        data: { email, name, password, ...(phone ? { phone } : {}) },
        overrideAccess: true,
      })
    } catch (error) {
      /**
       * Most likely two sign-ups for the same address arriving together: the
       * lookup above found nothing for both, and the unique index refused the
       * second. That is a duplicate, not a failure the caller should see - and
       * saying so would leak the thing this whole route is arranged to hide.
       */
      /**
       * A warning rather than an error, because the likely cause is benign - two
       * sign-ups racing, the second refused by the unique index. Worth recording
       * anyway: if this ever climbs, the cause is not a race.
       */
      await reportError(error, {
        source: 'auth.signup.create',
        path: '/auth/signup',
        level: 'warning',
      })
    }

    return json({ ok: true, message: CHECK_YOUR_EMAIL }, 202)
  },
  RATE_LIMIT.AUTH_PER_WINDOW,
  { shared: true },
)
