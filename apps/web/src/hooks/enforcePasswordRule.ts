import { passwordProblem } from '@vardenia/core'
import { ValidationError, type CollectionBeforeValidateHook } from 'payload'

/**
 * One password rule for every account, whatever path sets it (20 November 2026).
 *
 * The rule (at least 10 characters, spaces alone do not count) lived only in the
 * site's own forms. Payload's own check allows 3 characters, so an admin
 * creating a partner or team member, the API, a script, or a profile edit could
 * set a password the forms would refuse. Found in the authentication audit.
 *
 * Runs on create and update for customers, partners and the team. Payload's
 * built-in reset never passes the new password to collection hooks, so that
 * path has its own guard: lib/password-rule. Signing in is untouched, so an
 * older, shorter password keeps working until it is next changed.
 */
export const enforcePasswordRule: CollectionBeforeValidateHook = ({ collection, data }) => {
  const password = (data as { password?: unknown } | undefined)?.password
  if (password === undefined || password === null || password === '') return data

  const problem = passwordProblem(password)
  if (problem) {
    throw new ValidationError({
      collection: collection?.slug,
      errors: [{ message: `Password ${problem}. Spaces alone do not count.`, path: 'password' }],
    })
  }
  return data
}
