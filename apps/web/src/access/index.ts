/**
 * Role-based access control.
 *
 * Three roles, all of them Vardenia staff:
 *  - admin  : the founding team. Everything, including tier and verification.
 *  - editor : writes and publishes editorial, curates listings.
 *  - sales  : creates and edits listings and contracts, cannot publish articles.
 *
 * Businesses listed in the directory do NOT get accounts. Everything they want
 * changed goes through the team, which is a deliberate editorial decision: a
 * curated luxury title cannot let subjects edit their own entries. It also means
 * there is no such thing as a logged-in outsider, so the only two audiences this
 * file has to separate are "staff" and "the public".
 *
 * If self-service is ever wanted, it is a new role plus per-record scoping, and
 * it deserves its own ADR rather than being reintroduced quietly.
 */

import type { Access, FieldAccess } from 'payload'

export type Role = 'admin' | 'editor' | 'sales'

interface UserWithRoles {
  id: string | number
  roles?: Role[]
}

const rolesOf = (user: unknown): Role[] => (user as UserWithRoles | null)?.roles ?? []

/** Every current role is staff, but check explicitly so a future role is not staff by default. */
const isStaffUser = (user: unknown): boolean =>
  rolesOf(user).some((role) => role === 'admin' || role === 'editor' || role === 'sales')

export const hasRole =
  (...allowed: Role[]): Access =>
  ({ req }) =>
    rolesOf(req.user).some((role) => allowed.includes(role))

export const isAdmin: Access = ({ req }) => rolesOf(req.user).includes('admin')

export const isAdminFieldLevel: FieldAccess = ({ req }) => rolesOf(req.user).includes('admin')

/**
 * Field-level staff check. Use this on any field that must not reach the public
 * API, and do NOT rely on `admin.condition` for that: a tab condition hides a
 * field in the admin UI only. The REST and GraphQL endpoints keep serialising
 * it, so a contract value hidden behind a condition is still one unauthenticated
 * request away.
 */
export const isStaffFieldLevel: FieldAccess = ({ req }) => isStaffUser(req.user)

export const isStaff: Access = ({ req }) => isStaffUser(req.user)

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
