import type { CollectionAfterChangeHook } from 'payload'
import { PARTNER_INVITE_MS, partnerResetEmail } from '../lib/auth-email'
import { reportError } from '../lib/report'

/**
 * Sends a new partner a link to choose their own password.
 *
 * This is how an owner gets in for the first time, and until it existed there
 * was no way at all. Staff created the account in the admin, typed a password
 * into the form, and then had to pass it to the owner by hand - which means the
 * team knows every partner's credentials and those credentials live in a
 * WhatsApp thread. The dashboard was built and unreachable.
 *
 * # Onboarding is a password reset wearing a different hat
 *
 * `forgotPassword` mints a token and stores it against the account. That is
 * exactly what an invitation needs, so there is no second token mechanism. It
 * also means the password staff typed during creation is never the one that
 * gets used: the owner replaces it before they can sign in.
 *
 * # Why the email is sent here, not by Payload (20 November 2026)
 *
 * Payload's forgotPassword, when it sends the email itself, first reserves a
 * "one request per 15 seconds" slot by looking the account up on a separate
 * database connection. This hook runs inside the create, before it commits, so
 * that connection cannot see the new account, finds nobody, and Payload then
 * does nothing on purpose ("no such address" must look like "sent"). Every
 * invitation was silently skipped: the account existed with no link and no
 * email. Found in the authentication audit.
 *
 * So Payload is asked only for the token (`disableEmail`, which skips the
 * reservation and looks the account up inside this transaction), with the
 * invitation's longer lifetime, and the invitation email is sent here.
 * An ordinary reset still goes through Payload and keeps the default hour.
 *
 * # Failure is reported, never thrown
 *
 * A throw here would fail the create, so staff would see an error, press save
 * again, and hit a duplicate email. The account existing without an invitation
 * is recoverable by pressing "forgot password" on their behalf; a partner record
 * that refuses to save is not.
 */
export const inviteBusinessUser: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc

  const email = String((doc as { email?: unknown }).email ?? '')
  if (!email) return doc
  const businessUser = (doc as { id?: unknown }).id

  try {
    const token = await req.payload.forgotPassword({
      collection: 'business-users',
      data: { email },
      disableEmail: true,
      expiration: PARTNER_INVITE_MS,
      // Joins the transaction the create is still inside, so the lookup sees
      // the new account.
      req,
    })
    if (!token) {
      await reportError(new Error('No invitation token for a new partner account'), {
        source: 'partner.invite',
        extra: { businessUser },
      })
      return doc
    }

    const mail = partnerResetEmail(token, undefined, { invite: true })
    await req.payload.sendEmail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })
  } catch (error) {
    await reportError(error, { source: 'partner.invite', extra: { businessUser } })
  }

  return doc
}
