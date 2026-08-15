import { describe, expect, it } from 'vitest'
import type { Access, FieldAccess } from 'payload'
import {
  anyone,
  isAdmin,
  isAdminFieldLevel,
  isStaff,
  isStaffFieldLevel,
  publishedOrStaff,
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

const admin = { id: 1, roles: ['admin'] }
const staff = { id: 2, roles: ['staff'] }
const both = { id: 3, roles: ['staff', 'admin'] }

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
    expect(isStaff(ctx({ id: 9, roles: ['editor', 'staff'] }))).toBe(true)
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
