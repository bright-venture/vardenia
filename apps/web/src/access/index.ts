/**
 * Role-based access control.
 *
 * Four roles, because four kinds of people touch this system:
 *  - admin      : the founding team. Everything.
 *  - editor     : writes and publishes editorial + curates listings.
 *  - sales      : creates and edits listings and contracts, cannot publish articles.
 *  - advertiser : a paying business owner. Sees and edits ONLY their own listing.
 *
 * `advertiser` is the load-bearing one. It is what lets a hotel update its own
 * photos and offers without emailing the team - which is the difference between
 * a directory that rots in six months and one that stays current.
 */

import type { Access, FieldAccess } from 'payload'

export type Role = 'admin' | 'editor' | 'sales' | 'advertiser'

interface UserWithRoles {
  id: string | number
  roles?: Role[]
  /** Listing IDs this advertiser is allowed to manage. */
  managedBusinesses?: (string | number | { id: string | number })[]
}

const rolesOf = (user: unknown): Role[] => (user as UserWithRoles | null)?.roles ?? []

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
export const isStaffFieldLevel: FieldAccess = ({ req }) =>
  rolesOf(req.user).some((role) => role === 'admin' || role === 'editor' || role === 'sales')

export const isStaff: Access = ({ req }) =>
  rolesOf(req.user).some((role) => role === 'admin' || role === 'editor' || role === 'sales')

/** Anyone may read, but only published documents. Staff see drafts too. */
export const publishedOrStaff: Access = ({ req }) => {
  if (rolesOf(req.user).some((role) => role !== 'advertiser')) return true
  return { _status: { equals: 'published' } }
}

/**
 * Staff get everything; an advertiser is scoped to the listings assigned to them.
 * Returning a query constraint (rather than true/false) makes Payload filter at
 * the database level, so an advertiser cannot enumerate other listings via the API.
 */
export const ownBusinessOnly: Access = ({ req }) => {
  const roles = rolesOf(req.user)
  if (roles.some((role) => role === 'admin' || role === 'editor' || role === 'sales')) return true
  if (!roles.includes('advertiser')) return false

  const managed = (req.user as UserWithRoles | null)?.managedBusinesses ?? []
  const ids = managed.map((entry) => (typeof entry === 'object' ? entry.id : entry))
  if (ids.length === 0) return false
  return { id: { in: ids } }
}

/** Same scoping, for collections that point AT a business (offers, QR codes). */
export const ownBusinessRelationOnly =
  (relationField: string): Access =>
  ({ req }) => {
    const roles = rolesOf(req.user)
    if (roles.some((role) => role === 'admin' || role === 'editor' || role === 'sales')) return true
    if (!roles.includes('advertiser')) return false

    const managed = (req.user as UserWithRoles | null)?.managedBusinesses ?? []
    const ids = managed.map((entry) => (typeof entry === 'object' ? entry.id : entry))
    if (ids.length === 0) return false
    return { [relationField]: { in: ids } }
  }

export const anyone: Access = () => true
