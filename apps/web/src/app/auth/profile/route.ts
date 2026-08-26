import { randomUUID } from 'node:crypto'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { z } from 'zod'
import config from '../../../payload.config'
import { CUSTOMER_COLLECTION } from '../../../access/index'
import { RATE_LIMIT, withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'
import { verificationEmail } from '../../../lib/auth-email'

/**
 * A customer editing their own account: name, email address, password.
 *
 * # Three changes, two security tiers
 *
 * Changing a name is cosmetic and needs only a session. Changing an email
 * address or a password is an account takeover if it is wrong, so both require
 * the current password as well - which is the difference between "somebody has
 * this browser" and "somebody knows the secret".
 *
 * That distinction matters because a session cookie survives a borrowed laptop,
 * a shared machine and a stolen phone. The same reasoning is already written
 * out at /auth/delete, which asks for the password before closing an account.
 *
 * # Why the password check is a login call
 *
 * Payload does not expose "verify this password" on its own. Calling `login`
 * with the address on the account and the supplied password is the same check
 * the sign-in page makes, and it fails the same way. The token it returns is
 * thrown away: this route issues no cookie and does not touch the session.
 *
 * # Changing an email un-verifies it
 *
 * The new address is unproven by definition - anybody can type one. So the
 * account is marked unverified and a fresh verification mail goes to the new
 * address, exactly as at sign-up. Skipping that would let a customer set their
 * address to somebody else's and receive that person's booking mail.
 *
 * The old address is told as well. An email change is the classic first move in
 * an account takeover, and the only person who can still act on the warning is
 * whoever holds the old inbox.
 *
 * # Rate limited on the tight budget
 *
 * It sends mail and it checks passwords, which are the two things the general
 * 300-a-minute budget is far too generous for. See lib/rate-limit.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** Mirrors the sign-up rules, so an account cannot be edited into an invalid one. */
const nameSchema = z.string().trim().min(2, 'Enter your name.').max(80)
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.')
const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That is longer than we can store.')

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('name'), name: nameSchema }),
  z.object({
    action: z.literal('email'),
    email: emailSchema,
    currentPassword: z.string().min(1, 'Enter your current password.'),
  }),
  z.object({
    action: z.literal('password'),
    password: passwordSchema,
    currentPassword: z.string().min(1, 'Enter your current password.'),
  }),
])

const fieldErrors = (error: z.ZodError) => {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!out[key]) out[key] = issue.message
  }
  return out
}

export const PATCH = withRateLimit(
  async (request: Request) => {
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return json({ ok: false, message: 'Expected a JSON body.' }, 400)
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return json({ ok: false, errors: fieldErrors(parsed.error) }, 400)
    }

    const payload = await getPayload({ config })

    const auth = await payload
      .auth({ headers: await nextHeaders() })
      .catch(() => ({ user: null }) as { user: null })

    const user = auth.user
    if (!user || user.collection !== CUSTOMER_COLLECTION) {
      return json({ ok: false, message: 'Sign in first.' }, 401)
    }

    const id = user.id
    const currentEmail = String(user.email ?? '')
    const data = parsed.data

    // Name only needs the session, so it answers before any password work.
    if (data.action === 'name') {
      await payload.update({
        collection: 'customers',
        id,
        data: { name: data.name },
        overrideAccess: false,
        user,
      })
      return json({ ok: true, message: 'Your name has been updated.' })
    }

    /**
     * Everything below changes a credential, so prove the password first.
     *
     * The message is deliberately about the password rather than the account:
     * this caller is already authenticated, so there is nothing to enumerate and
     * nothing gained by being vague.
     */
    const verified = await payload
      .login({
        collection: 'customers',
        data: { email: currentEmail, password: data.currentPassword },
      })
      .then(() => true)
      .catch(() => false)

    if (!verified) {
      return json({ ok: false, errors: { currentPassword: 'That password is not right.' } }, 403)
    }

    if (data.action === 'password') {
      await payload.update({
        collection: 'customers',
        id,
        data: { password: data.password },
        overrideAccess: false,
        user,
      })

      /**
       * The session is deliberately left alone.
       *
       * Payload does not revoke other sessions on a password change, and forcing
       * a sign-out here would only end the one session we know is legitimate -
       * the person who just proved they know the password. Revoking everything
       * else needs a token version on the collection, which is a separate piece
       * of work and worth doing.
       */
      return json({ ok: true, message: 'Your password has been changed.' })
    }

    // action === 'email'
    if (data.email === currentEmail) {
      return json({ ok: true, message: 'That is already your address.' })
    }

    const taken = await payload.find({
      collection: 'customers',
      where: { email: { equals: data.email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (taken.docs.length > 0) {
      /**
       * The only place this route says anything about another account, and it is
       * unavoidable: the address has to be free or the change cannot happen. It
       * reveals no more than the sign-up form does when it refuses a duplicate,
       * and the caller is authenticated rather than anonymous.
       */
      return json({ ok: false, errors: { email: 'That address is already in use.' } }, 409)
    }

    /**
     * A fresh verification token, generated here because Payload will not.
     *
     * `verify: true` sends a verification mail on *create* and on nothing else.
     * Updating the address and clearing `_verified` leaves an account that can
     * never be verified: the flag is false, no token exists, and nothing in
     * Payload will issue one. The first version of this route did exactly that
     * and told the customer to check their inbox for a mail that was never sent.
     *
     * `randomUUID` rather than a counter or a timestamp: the token is the only
     * thing standing between a typed address and a verified account, so it has to
     * be unguessable. Payload's own tokens are generated the same way.
     */
    const verificationToken = randomUUID()

    await payload.update({
      collection: 'customers',
      id,
      data: {
        email: data.email,
        // Unproven by definition. Anybody can type an address.
        _verified: false,
        _verificationToken: verificationToken,
      },
      overrideAccess: true,
    })

    /**
     * The verification mail, sent by hand for the same reason the token is
     * generated by hand. Uses the same template as sign-up, so the link points at
     * our page rather than Payload's admin panel - see lib/auth-email.
     */
    const verification = verificationEmail(verificationToken)
    await payload
      .sendEmail({
        to: data.email,
        subject: verification.subject,
        html: verification.html,
      })
      .catch(async (error) => {
        /**
         * Reported rather than swallowed, because this one is not cosmetic: the
         * account is now unverified with a mail that never arrived, which is a
         * customer locked out of their own bookings.
         */
        await reportError(error, { source: 'auth.profile.verification', path: '/auth/profile' })
      })

    /**
     * Tell the address that is losing the account.
     *
     * Best effort, and the change stands whether or not it arrives - failing the
     * update because a warning bounced would leave the account in a state neither
     * address controls. Reported so the failure is visible to us.
     */
    await payload
      .sendEmail({
        to: currentEmail,
        subject: 'Your Vardenia email address was changed',
        text:
          `The email address on your Vardenia account was changed to ${data.email}.\n\n` +
          `If that was you, nothing else is needed.\n\n` +
          `If it was not, reply to this message immediately - whoever made the ` +
          `change cannot sign in until the new address is verified.`,
      })
      .catch(async (error) => {
        await reportError(error, { source: 'auth.profile.old-address', path: '/auth/profile' })
      })

    return json({
      ok: true,
      message: 'Check the new address for a link to confirm it.',
      verificationSent: true,
    })
  },
  RATE_LIMIT.AUTH_PER_WINDOW,
  { shared: true },
)
