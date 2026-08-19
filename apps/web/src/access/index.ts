/**
 * Access control across three kinds of account.
 *
 * Staff roles, unchanged:
 *  - admin : the founding team. Everything, including who else gets an account.
 *  - staff : everyone else on the Vardenia team. Creates and edits all content.
 *
 * There were four (editor, sales, advertiser) and they were mostly theatre: the
 * rules barely differed, and one documented difference was not enforced at all.
 * Roles that do not change behaviour are worse than no roles, because they read
 * as a guarantee nobody is checking. Split them again when two real people
 * genuinely need different powers.
 *
 * Since bookings, there are two further account types, and they are separate
 * collections rather than more roles here:
 *  - business-users : an owner or manager of listings we have onboarded. Manages
 *    bookings for their own businesses. Never edits how their listing appears -
 *    the team still curates that, which is the whole promise on the home page.
 *  - customers : the public. Books things.
 *
 * Separate collections because only `users` is bound to `admin.user`, so only
 * `users` can reach the admin panel at all. A role-check bug in one collection
 * is then a bug; a role-check bug in a shared collection would be advertiser
 * contract values in a stranger's hands.
 *
 * The division of labour:
 *  - staff own content: listings, articles, issues, media.
 *  - admin owns identity (all three collections) and the permanence layer (QR
 *    codes, scan events), plus commercial flags like tier and verification.
 *  - business-users own nothing yet; they read their own listings.
 */

import type { Access, FieldAccess, Where } from 'payload'

export type Role = 'admin' | 'staff'

/** The auth collection whose members may hold staff roles. */
export const STAFF_COLLECTION = 'users'
export const BUSINESS_USER_COLLECTION = 'business-users'
export const CUSTOMER_COLLECTION = 'customers'

interface UserWithRoles {
  id: string | number
  collection?: string
  roles?: Role[]
}

/** Which auth collection this request authenticated against, if any. */
const collectionOf = (user: unknown): string | null =>
  (user as UserWithRoles | null)?.collection ?? null

/**
 * Roles, but only from the staff collection.
 *
 * The collection check is the load-bearing part, and it is new. Payload puts
 * every authenticated user on `req.user` regardless of which collection they
 * came from, so a function that reads `user.roles` and nothing else cannot tell
 * a staff member from anyone else who happens to have a field of that name.
 * Give `business-users` or `customers` a `roles` field - now, or in a year, by
 * accident - and a customer could hold `roles: ['admin']` and pass `isAdmin`.
 * Not a theoretical escalation: a plausible one, arriving through a schema
 * change that looks harmless.
 *
 * `Array.isArray` rather than `?? []` alone, for the same reason as before.
 * Every check below calls `.some()` on the result. If `roles` were ever a bare
 * string or a number - a hand-edited row, a bad import, a future schema change -
 * that throws a TypeError instead of denying, which turns a permission question
 * into a 500. Denying is the answer we want for input we cannot read.
 */
const rolesOf = (user: unknown): Role[] => {
  if (collectionOf(user) !== STAFF_COLLECTION) return []
  const roles = (user as UserWithRoles | null)?.roles
  return Array.isArray(roles) ? roles : []
}

/**
 * Admin counts as staff. Every check below reads through this.
 *
 * Exported because the sort guard needs the same question answered outside an
 * `Access` function - it runs in `beforeOperation`, which has a `req` but no
 * access-function signature. Sharing the predicate keeps "who is staff" in one
 * place; a second definition there would be a second thing to keep in step with
 * the collection check that stops a customer with `roles: ['admin']` passing.
 */
export const isStaffUser = (user: unknown): boolean =>
  rolesOf(user).some((role) => role === 'admin' || role === 'staff')

export const isAdmin: Access = ({ req }) => rolesOf(req.user).includes('admin')

export const isStaff: Access = ({ req }) => isStaffUser(req.user)

export const isAdminFieldLevel: FieldAccess = ({ req }) => rolesOf(req.user).includes('admin')

/**
 * Field-level staff check. Use this on any field that must not reach the public
 * API, and do NOT rely on `admin.condition` for that: a tab condition hides a
 * field in the admin UI only. The REST and GraphQL endpoints keep serialising
 * it, so a contract value hidden behind a condition is still one unauthenticated
 * request away.
 */
export const isStaffFieldLevel: FieldAccess = ({ req }) => isStaffUser(req.user)

/**
 * Public reads are limited to published documents; staff also see drafts.
 *
 * Returns a query constraint rather than false, so Payload filters in the
 * database. An anonymous caller cannot page past the filter or count what is
 * hidden behind it.
 */
export const publishedOrStaff: Access = ({ req }) => {
  if (isStaffUser(req.user)) return true
  return { _status: { equals: 'published' } }
}

export const anyone: Access = () => true

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/** True only for a request authenticated as a business owner or manager. */
export const isBusinessUser: Access = ({ req }) =>
  collectionOf(req.user) === BUSINESS_USER_COLLECTION

/** True only for a request authenticated as a member of the public. */
export const isCustomer: Access = ({ req }) => collectionOf(req.user) === CUSTOMER_COLLECTION

/**
 * The ids of the businesses this account manages.
 *
 * Read off `req.user`, which Payload has already loaded, so an ownership check
 * costs nothing. That is why the relationship lives on the user rather than on
 * the business: access control that needs a database round trip per check is
 * both slower and easier to get quietly wrong.
 *
 * Depth varies. At depth 0 the field is a list of ids; populated it is a list of
 * documents. Both shapes appear depending on how the request was made, so both
 * are handled - and anything else is dropped rather than guessed at.
 *
 * Returns empty for staff, for customers, and for anonymous callers. Emptiness
 * means "owns nothing", never "owns everything": every caller below turns an
 * empty list into a constraint that matches no rows.
 */
export function ownedBusinessIds(user: unknown): (string | number)[] {
  if (collectionOf(user) !== BUSINESS_USER_COLLECTION) return []

  const value = (user as { businesses?: unknown }).businesses
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (typeof entry === 'string' || typeof entry === 'number') return entry
      const id = (entry as { id?: unknown } | null)?.id
      return typeof id === 'string' || typeof id === 'number' ? id : null
    })
    .filter((id): id is string | number => id !== null)
}

/**
 * Listings: published to everyone, everything to staff, plus your own to you.
 *
 * The owner clause is what lets a partner dashboard show a listing that is still
 * a draft - which is exactly when an owner most wants to look at it, while the
 * team is still writing it up.
 *
 * An owner with no businesses attached falls through to the public rule rather
 * than being refused outright. Refusing would be a worse bug to diagnose: the
 * dashboard would look broken rather than empty.
 */
export const publishedStaffOrOwned: Access = ({ req }) => {
  if (isStaffUser(req.user)) return true

  // Annotated rather than inferred: TypeScript otherwise widens the two branches
  // into a union carrying `or?: undefined`, which does not satisfy Where's index
  // signature.
  const published: Where = { _status: { equals: 'published' } }

  const owned = ownedBusinessIds(req.user)
  if (owned.length === 0) return published

  return { or: [published, { id: { in: owned } }] }
}

/**
 * Read your own account, or any if you are staff.
 *
 * Used by both new collections. Without the `id` clause a logged-in customer
 * could list every other customer, which is a data breach dressed up as a
 * feature.
 */
export const selfOrStaff: Access = ({ req }) => {
  if (isStaffUser(req.user)) return true
  if (!req.user) return false
  return { id: { equals: req.user.id } }
}
