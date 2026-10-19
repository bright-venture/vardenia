import { APIError, type CollectionBeforeOperationHook } from 'payload'
import { isStaffUser, STAFF_COLLECTION } from '../access/index'

/**
 * Only an admin changes the sign-in of somebody else's account.
 *
 * Staff may update any partner or customer account, which they need: a partner's
 * name, phone and listings are theirs to keep right. But the same rule let them
 * set another person's email and password, and with them take the account. For
 * a partner that is a venue's dashboard, its bookings and its bills; for a
 * customer, their bookings and personal details. Accounts are the admin's (see
 * access/index), and this is what makes that true of sign-in as well as of
 * deleting.
 *
 * Guarded:
 *  - email, when it differs from the current one
 *  - password, when one is given
 *  - `_verified`, when it differs from the current value
 *
 * Compared with the stored document rather than refused on sight, because the
 * admin panel sends every field on every save, the unchanged email included.
 * Refusing whenever `email` was present would stop staff fixing a phone number.
 *
 * Someone editing their own account is guardSelfAccountUpdate's question, not
 * this one. Writes with no user - scripts, the importer, the reset-password
 * flow - are not a staff member and pass.
 */
export const guardAccountIdentity: CollectionBeforeOperationHook = async ({
  args,
  operation,
  collection,
  req,
}) => {
  if (operation !== 'update') return args

  const user = req.user as { collection?: string; roles?: unknown } | null | undefined
  if (!user || user.collection !== STAFF_COLLECTION) return args
  if (!isStaffUser(user)) return args
  if (Array.isArray(user.roles) && user.roles.includes('admin')) return args

  const data = ((args as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>
  const givesPassword = typeof data.password === 'string' && data.password.length > 0
  const touchesEmail = typeof data.email === 'string'
  const touchesVerified = '_verified' in data

  if (givesPassword) throw refusal('password')
  if (!touchesEmail && !touchesVerified) return args

  const id = (args as { id?: string | number }).id
  // A bulk update with an email in it is never an ordinary edit.
  if (id === undefined || id === null) throw refusal(touchesEmail ? 'email' : 'verification')

  const current = (await req.payload
    .findByID({
      collection: collection.slug as never,
      id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    .catch(() => null)) as { email?: unknown; _verified?: unknown } | null
  if (!current) return args

  if (
    touchesEmail &&
    String(data.email).trim().toLowerCase() !==
      String(current.email ?? '')
        .trim()
        .toLowerCase()
  ) {
    throw refusal('email')
  }
  if (touchesVerified && Boolean(data._verified) !== Boolean(current._verified)) {
    throw refusal('verification')
  }

  return args
}

function refusal(what: 'email' | 'password' | 'verification'): APIError {
  const thing =
    what === 'verification' ? 'whether this account is verified' : `this account's ${what}`
  return new APIError(
    `Only an admin can change ${thing}. Ask an admin, or send the person a password reset link.`,
    403,
  )
}
