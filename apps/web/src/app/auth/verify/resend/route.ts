import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import { z } from 'zod'
import config from '../../../../payload.config'
import { RATE_LIMIT, withRateLimit } from '../../../../lib/rate-limit'
import { reportError } from '../../../../lib/report'
import { verificationEmail } from '../../../../lib/auth-email'

/**
 * Send the verification email again.
 *
 * # Why this exists
 *
 * Payload sends a verification mail once, on create, and never again. That was
 * survivable while an unverified account could still do everything except see a
 * banner. It stopped being survivable the moment booking required a verified
 * address: a mail that lands in junk left somebody with an account they cannot
 * use and no way to fix it. On a domain whose sending reputation is still new,
 * that is not an edge case.
 *
 * # Why it takes an address instead of a session
 *
 * The first version of this required a signed-in customer, which made it
 * useless to every single person who needs it. Payload does not merely flag an
 * unverified user - it refuses to authenticate them at all. Checked against the
 * running server: with `_verified` false, `/api/customers/me` returns
 * `user: null` even with a token minted moments earlier while verified.
 *
 * So the people locked out by an unverified address have no session to prove
 * anything with, by construction. This is shaped like forgot-password instead:
 * unauthenticated, given an address, and rate limited.
 *
 * # It always answers the same way
 *
 * Unknown address, already verified, or mail sent - one message, one status.
 * Anything else turns this into a way to ask whether somebody has an account
 * here, which is the disclosure /auth/signup is arranged to avoid and would be
 * pointless to protect there and leak here.
 *
 * The cost is that a typo produces the same reassuring sentence as a success.
 * That is the accepted trade everywhere this pattern is used, and the reader
 * finds out within a minute when nothing arrives.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
})

/** The one answer, whatever happened. */
const SAME_ANSWER = {
  ok: true,
  message: 'If that address needs confirming, we have sent a new link to it.',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

export const POST = withRateLimit(async (request: Request) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))

  // Even a malformed body gets the standard answer rather than a field error,
  // so the shape of the response never depends on what was sent.
  if (!parsed.success) return json(SAME_ANSWER)

  const payload = await getPayload({ config })

  try {
    const found = await payload.find({
      collection: 'customers',
      where: { email: { equals: parsed.data.email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const customer = found.docs[0] as { id: number; _verified?: boolean } | undefined

    // Nothing to do for an address we do not hold, or one already confirmed.
    if (!customer || customer._verified === true) return json(SAME_ANSWER)

    /**
     * A fresh token, replacing the old one.
     *
     * If somebody asks twice because the first never arrived, both links
     * working would mean two live credentials for one account, and the older
     * may be sitting in a mail archive. Same reasoning as /auth/profile.
     */
    const token = randomUUID()

    await payload.update({
      collection: 'customers',
      id: customer.id,
      data: { _verificationToken: token },
      overrideAccess: true,
    })

    const mail = verificationEmail(token)
    await payload.sendEmail({ to: parsed.data.email, subject: mail.subject, html: mail.html })
  } catch (error) {
    /**
     * Reported, and still answered the same way.
     *
     * Telling the caller it failed would distinguish an address we hold from
     * one we do not, which is the whole thing this route is careful about. The
     * failure is ours to notice, not theirs to interpret.
     */
    await reportError(error, { source: 'auth.verify.resend', path: '/auth/verify/resend' })
  }

  return json(SAME_ANSWER)
}, RATE_LIMIT.AUTH_PER_WINDOW)
