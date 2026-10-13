import { APIError, type CollectionBeforeOperationHook } from 'payload'

/**
 * An account may not change its own email or password through the generic API.
 *
 * Customers and partners may update their own record (see selfOrStaff), which
 * is how a name gets changed. But the same endpoint, `PATCH /api/customers/<id>`,
 * would also take a new email or password with nothing but the session cookie
 * - so a borrowed laptop or a stolen cookie became a stolen account, bypassing
 * the current-password check that /auth/profile asks for.
 *
 * Those changes now go only through the routes that re-check the password
 * first, which say so by setting `context.reauthenticated`. Staff editing an
 * account, a password reset by emailed link, and server-side writes with no
 * signed-in user are not self-updates and pass untouched.
 *
 * An account also cannot mark its own email as verified: that is what the
 * emailed link proves, and setting it by hand would skip the proof.
 *
 * A `beforeOperation` hook rather than `beforeChange`, because it sees the
 * request as sent, before Payload lifts the password out of the data.
 */
export const guardSelfAccountUpdate: CollectionBeforeOperationHook = ({
  args,
  operation,
  collection,
  req,
  context,
}) => {
  if (operation !== 'update') return args

  const user = req.user as { collection?: string; email?: unknown } | null | undefined
  if (!user || user.collection !== collection.slug) return args
  if (context?.reauthenticated === true) return args

  const data = ((args as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>

  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : null
  const current = String(user.email ?? '').toLowerCase()
  const changesEmail = email !== null && email !== current
  const changesPassword = typeof data.password === 'string' && data.password.length > 0

  if (changesEmail || changesPassword) {
    throw new APIError(
      'Changing your email or password needs your current password. Use the page for your account.',
      403,
    )
  }

  if ('_verified' in data || '_verificationToken' in data) {
    throw new APIError('An account cannot change its own verification.', 403)
  }

  return args
}
