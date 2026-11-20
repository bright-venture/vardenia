import type { CollectionAfterChangeHook } from 'payload'
import { PARTNER_INVITE_CONTEXT, PARTNER_INVITE_MS } from '../lib/auth-email'
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
 * `forgotPassword` mints a token, stores it against the account and mails the
 * link. That is exactly what an invitation needs, so there is no second
 * mechanism to build or keep working. It also means the password staff typed
 * during creation is never the one that gets used: the owner replaces it before
 * they can sign in, and nobody has to remember to.
 *
 * See lib/auth-email for the message, which deliberately reads the same whether
 * it is an invitation or a genuine reset - from the reader's side those are the
 * same act.
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

  // Marks this email as the invitation, for the email builder in BusinessUsers,
  // and asks for a link that outlives an ordinary reset (20 November 2026).
  // Taken off again after, because the context belongs to the whole request.
  const context = req.context as Record<string, unknown>
  context[PARTNER_INVITE_CONTEXT] = true
  try {
    await req.payload.forgotPassword({
      collection: 'business-users',
      data: { email },
      disableEmail: false,
      expiration: PARTNER_INVITE_MS,

      /**
       * Passed so this joins the transaction the create is still inside.
       *
       * Without it the lookup runs on its own connection, cannot see the row
       * that has not been committed yet, and finds nobody - at which point
       * Payload deliberately does nothing, because "no such address" must not be
       * distinguishable from "sent". Correct behaviour, and here it meant the
       * invitation silently never went out while the account was created
       * perfectly. Found because a probe counted the emails.
       */
      req,
    })
  } catch (error) {
    await reportError(error, {
      source: 'partner.invite',
      extra: { businessUser: (doc as { id?: unknown }).id },
    })
  } finally {
    delete context[PARTNER_INVITE_CONTEXT]
  }

  return doc
}
