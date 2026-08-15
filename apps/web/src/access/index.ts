/**
 * Role-based access control.
 *
 * Two roles:
 *  - admin : the founding team. Everything, including who else gets an account.
 *  - staff : everyone else on the Vardenia team. Creates and edits all content.
 *
 * There were four (editor, sales, advertiser) and they were mostly theatre: the
 * rules barely differed, and one documented difference was not enforced at all.
 * Roles that do not change behaviour are worse than no roles, because they read
 * as a guarantee nobody is checking. Split them again when two real people
 * genuinely need different powers.
 *
 * Listed businesses do NOT get accounts. Everything they want changed goes
 * through the team, so the only line this file draws is staff versus public.
 *
 * The division of labour:
 *  - staff own content: listings, articles, issues, pages, media.
 *  - admin owns identity (users) and the permanence layer (QR codes, scan
 *    events), plus commercial flags like tier and verification.
 */

import type { Access, FieldAccess } from 'payload'

export type Role = 'admin' | 'staff'

interface UserWithRoles {
  id: string | number
  roles?: Role[]
}

/**
 * `Array.isArray` rather than `?? []` alone.
 *
 * Every check below calls `.some()` on the result. If `roles` were ever a bare
 * string or a number - a hand-edited row, a bad import, a future schema change -
 * that throws a TypeError instead of denying, which turns a permission question
 * into a 500. Denying is the answer we want for input we cannot read.
 */
const rolesOf = (user: unknown): Role[] => {
  const roles = (user as UserWithRoles | null)?.roles
  return Array.isArray(roles) ? roles : []
}

/** Admin counts as staff. Every check below reads through this. */
const isStaffUser = (user: unknown): boolean =>
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
