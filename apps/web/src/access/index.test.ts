import { describe, expect, it } from 'vitest'
import type { Access, FieldAccess } from 'payload'
import {
  anyone,
  isAdmin,
  isAdminFieldLevel,
  isBusinessUser,
  isCustomer,
  isStaff,
  isStaffFieldLevel,
  ownedBusinessIds,
  publishedOrStaff,
  publishedStaffOrOwned,
  selfOrStaff,
} from './index'

/**
 * The 65 lines in this module are the whole boundary between the public API and
 * the Commercial tab - contract dates, sales owner, internal notes. Until now
 * they were verified by hand once and never again.
 *
 * These are pure functions of `req.user`, so they test directly. What they
 * cannot tell you is whether a collection actually *uses* the right one; that is
 * what collections/access-policy.test.ts covers.
 */

const admin = { id: 1, collection: 'users', roles: ['admin'] }
const staff = { id: 2, collection: 'users', roles: ['staff'] }
const both = { id: 3, collection: 'users', roles: ['staff', 'admin'] }

/** Payload hands access functions the whole request; only `req.user` is read. */
const ctx = (user: unknown, extra: Record<string, unknown> = {}) =>
  ({ req: { user }, ...extra }) as unknown as Parameters<Access>[0]

const fieldCtx = (user: unknown) => ctx(user) as unknown as Parameters<FieldAccess>[0]

describe('isAdmin', () => {
  it('admits admins', () => {
    expect(isAdmin(ctx(admin))).toBe(true)
    expect(isAdmin(ctx(both))).toBe(true)
  })

  it('refuses staff', () => {
    expect(isAdmin(ctx(staff))).toBe(false)
  })

  it('refuses anonymous callers', () => {
    expect(isAdmin(ctx(null))).toBe(false)
    expect(isAdmin(ctx(undefined))).toBe(false)
  })
})

describe('isStaff', () => {
  it('treats admin as staff, so admins are never locked out of content', () => {
    expect(isStaff(ctx(admin))).toBe(true)
  })

  it('admits staff', () => {
    expect(isStaff(ctx(staff))).toBe(true)
  })

  it('refuses anonymous callers', () => {
    expect(isStaff(ctx(null))).toBe(false)
  })
})

/**
 * There used to be editor, sales and advertiser roles. They were removed for
 * being theatre, but a user row created back then still carries the string, and
 * a role we no longer recognise must not resolve to access.
 */
describe('roles that no longer exist', () => {
  it.each(['editor', 'sales', 'advertiser', 'superuser', ''])('refuses %o', (role) => {
    expect(isStaff(ctx({ id: 9, roles: [role] }))).toBe(false)
    expect(isAdmin(ctx({ id: 9, roles: [role] }))).toBe(false)
  })

  it('still admits a real role listed alongside a dead one', () => {
    expect(isStaff(ctx({ id: 9, collection: 'users', roles: ['editor', 'staff'] }))).toBe(true)
  })
})

/**
 * Anything unreadable has to deny rather than throw. A TypeError inside an
 * access function is a 500, which is a worse answer than "no" and much harder to
 * spot in a log.
 */
describe('malformed users fail closed', () => {
  const malformed: unknown[] = [
    null,
    undefined,
    {},
    { id: 1 },
    { id: 1, roles: null },
    { id: 1, roles: [] },
    { id: 1, roles: 'admin' },
    { id: 1, roles: 42 },
    { id: 1, roles: { admin: true } },
    'admin',
    42,
  ]

  it.each(malformed)('denies %o without throwing', (user) => {
    expect(() => isStaff(ctx(user))).not.toThrow()
    expect(isStaff(ctx(user))).toBe(false)
    expect(isAdmin(ctx(user))).toBe(false)
  })
})

describe('field level checks match their collection level twins', () => {
  it('isAdminFieldLevel tracks isAdmin', () => {
    expect(isAdminFieldLevel(fieldCtx(admin))).toBe(true)
    expect(isAdminFieldLevel(fieldCtx(staff))).toBe(false)
    expect(isAdminFieldLevel(fieldCtx(null))).toBe(false)
  })

  it('isStaffFieldLevel tracks isStaff', () => {
    expect(isStaffFieldLevel(fieldCtx(admin))).toBe(true)
    expect(isStaffFieldLevel(fieldCtx(staff))).toBe(true)
    expect(isStaffFieldLevel(fieldCtx(null))).toBe(false)
  })
})

/**
 * The important part is that anonymous callers get a *query constraint*, not
 * `false`. Returning false would deny the whole collection; returning a
 * constraint lets Payload filter in the database, so an anonymous caller cannot
 * page past it or learn how many drafts exist from a total count.
 */
describe('publishedOrStaff', () => {
  it('gives staff everything, drafts included', () => {
    expect(publishedOrStaff(ctx(staff))).toBe(true)
    expect(publishedOrStaff(ctx(admin))).toBe(true)
  })

  it('constrains anonymous callers to published documents', () => {
    expect(publishedOrStaff(ctx(null))).toEqual({ _status: { equals: 'published' } })
  })

  it('constrains a user with a dead role rather than trusting it', () => {
    expect(publishedOrStaff(ctx({ id: 9, roles: ['editor'] }))).toEqual({
      _status: { equals: 'published' },
    })
  })

  it('never returns a bare true for anyone unauthenticated', () => {
    for (const user of [null, undefined, {}, { roles: [] }, { roles: 'staff' }]) {
      expect(publishedOrStaff(ctx(user))).not.toBe(true)
    }
  })
})

describe('anyone', () => {
  it('is public by design, used for media and issues', () => {
    expect(anyone(ctx(null))).toBe(true)
    expect(anyone(ctx(admin))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cross-collection escalation
// ---------------------------------------------------------------------------

/**
 * The reason `rolesOf` checks which collection a user came from.
 *
 * Payload puts every authenticated user on `req.user` whatever collection they
 * logged in against. A check that reads `user.roles` alone therefore cannot tell
 * a staff member from a customer who happens to have a field of that name - and
 * `roles` is an ordinary enough name to appear on a bookings account one day
 * without anyone connecting it to this file.
 *
 * These tests describe a schema that does not exist yet on purpose. They are
 * what makes adding it safe.
 */
describe('roles are only honoured from the staff collection', () => {
  const impostors = [
    { id: 10, collection: 'customers', roles: ['admin'] },
    { id: 11, collection: 'business-users', roles: ['admin'] },
    { id: 12, collection: 'business-users', roles: ['staff', 'admin'] },
  ]

  it.each(impostors)('refuses admin to $collection carrying roles', (user) => {
    expect(isAdmin(ctx(user))).toBe(false)
    expect(isAdminFieldLevel(fieldCtx(user))).toBe(false)
  })

  it.each(impostors)('refuses staff to $collection carrying roles', (user) => {
    expect(isStaff(ctx(user))).toBe(false)
    expect(isStaffFieldLevel(fieldCtx(user))).toBe(false)
  })

  /** The Commercial tab is what this protects: contract values, internal notes. */
  it('keeps a role-carrying customer on the public read constraint', () => {
    const customer = { id: 13, collection: 'customers', roles: ['admin'] }
    expect(publishedOrStaff(ctx(customer))).toEqual({ _status: { equals: 'published' } })
  })

  /** A user with no collection at all denies rather than throws. */
  it('refuses a user whose collection is missing', () => {
    expect(isStaff(ctx({ id: 14, roles: ['staff'] }))).toBe(false)
    expect(isAdmin(ctx({ id: 14, roles: ['admin'] }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

const owner = (id: number, businesses: unknown) => ({
  id,
  collection: 'business-users',
  businesses,
})

describe('ownedBusinessIds', () => {
  it('reads a list of ids, which is the depth-0 shape', () => {
    expect(ownedBusinessIds(owner(1, [7, 9]))).toEqual([7, 9])
  })

  /** Populated relationships arrive as documents instead. Both shapes are real. */
  it('reads a list of documents, which is the populated shape', () => {
    expect(ownedBusinessIds(owner(1, [{ id: 7, name: 'A' }, { id: 9 }]))).toEqual([7, 9])
  })

  it('handles the two shapes mixed, which happens at depth 1 with a broken relation', () => {
    expect(ownedBusinessIds(owner(1, [7, { id: 9 }]))).toEqual([7, 9])
  })

  /**
   * Emptiness must mean "owns nothing". Every caller turns an empty list into a
   * constraint matching no rows, so a shape we cannot read has to land here
   * rather than anywhere permissive.
   */
  it.each([
    ['no businesses field', { id: 1, collection: 'business-users' }],
    ['null', owner(1, null)],
    ['a bare id rather than a list', owner(1, 7)],
    ['a string', owner(1, 'seven')],
    ['entries with no id', owner(1, [{ name: 'A' }, null, undefined])],
  ])('returns empty for %s', (_label, user) => {
    expect(ownedBusinessIds(user)).toEqual([])
  })

  /**
   * The collection guard again. Staff hold no businesses, and a customer with a
   * hand-set `businesses` array must not inherit one.
   */
  it('ignores businesses on any collection but business-users', () => {
    expect(ownedBusinessIds({ id: 1, collection: 'users', businesses: [7] })).toEqual([])
    expect(ownedBusinessIds({ id: 1, collection: 'customers', businesses: [7] })).toEqual([])
    expect(ownedBusinessIds(null)).toEqual([])
  })
})

describe('publishedStaffOrOwned', () => {
  it('gives staff everything', () => {
    expect(publishedStaffOrOwned(ctx(staff))).toBe(true)
  })

  it('constrains the public to published listings', () => {
    expect(publishedStaffOrOwned(ctx(null))).toEqual({ _status: { equals: 'published' } })
  })

  /**
   * The clause that makes a partner dashboard useful: an owner sees their own
   * listing even while it is a draft, which is exactly when they want to look.
   */
  it('adds the owner their own listings, drafts included', () => {
    expect(publishedStaffOrOwned(ctx(owner(1, [7, 9])))).toEqual({
      or: [{ _status: { equals: 'published' } }, { id: { in: [7, 9] } }],
    })
  })

  it('never widens beyond the listings actually owned', () => {
    const result = publishedStaffOrOwned(ctx(owner(1, [7])))
    expect(result).not.toBe(true)
    expect(JSON.stringify(result)).not.toContain('"9"')
  })

  /** An owner with nothing attached falls back to public rather than being refused. */
  it('falls back to the public rule for an owner with no businesses', () => {
    expect(publishedStaffOrOwned(ctx(owner(1, [])))).toEqual({ _status: { equals: 'published' } })
  })

  it('does not let a customer with a forged businesses array see drafts', () => {
    const forged = { id: 5, collection: 'customers', businesses: [7] }
    expect(publishedStaffOrOwned(ctx(forged))).toEqual({ _status: { equals: 'published' } })
  })
})

describe('selfOrStaff', () => {
  it('gives staff every account', () => {
    expect(selfOrStaff(ctx(staff))).toBe(true)
  })

  /**
   * A constraint, not `true`. Without the id clause a logged-in customer could
   * list every other customer - a data breach wearing the shape of a feature.
   */
  it('constrains a customer to their own row', () => {
    expect(selfOrStaff(ctx({ id: 42, collection: 'customers' }))).toEqual({
      id: { equals: 42 },
    })
  })

  it('constrains an owner to their own row', () => {
    expect(selfOrStaff(ctx(owner(8, [7])))).toEqual({ id: { equals: 8 } })
  })

  it('refuses anonymous callers outright', () => {
    expect(selfOrStaff(ctx(null))).toBe(false)
  })
})

describe('isBusinessUser and isCustomer', () => {
  it('identify their own collection and nothing else', () => {
    expect(isBusinessUser(ctx(owner(1, [7])))).toBe(true)
    expect(isBusinessUser(ctx({ id: 1, collection: 'customers' }))).toBe(false)
    expect(isBusinessUser(ctx(staff))).toBe(false)
    expect(isBusinessUser(ctx(null))).toBe(false)

    expect(isCustomer(ctx({ id: 1, collection: 'customers' }))).toBe(true)
    expect(isCustomer(ctx(owner(1, [7])))).toBe(false)
    expect(isCustomer(ctx(staff))).toBe(false)
    expect(isCustomer(ctx(null))).toBe(false)
  })
})
