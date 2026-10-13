import { describe, expect, it } from 'vitest'
import { guardSelfAccountUpdate } from './guardSelfAccountUpdate'

type Args = Parameters<typeof guardSelfAccountUpdate>[0]

const customer = { id: 7, collection: 'customers', email: 'guest@example.com' }
const staff = { id: 1, collection: 'users', roles: ['staff'], email: 'team@example.com' }

const run = (
  data: Record<string, unknown>,
  user: unknown,
  { slug = 'customers', context = {} as Record<string, unknown>, operation = 'update' } = {},
) =>
  guardSelfAccountUpdate({
    args: { data, id: 7 },
    operation,
    collection: { slug },
    req: { user },
    context,
  } as unknown as Args)

describe('an account changing its own email or password', () => {
  it('is refused through the generic API', () => {
    expect(() => run({ password: 'new-password-123' }, customer)).toThrow(/current password/)
    expect(() => run({ email: 'thief@example.com' }, customer)).toThrow(/current password/)
  })

  it('is allowed from the route that re-checked the password', () => {
    expect(() =>
      run({ password: 'new-password-123' }, customer, { context: { reauthenticated: true } }),
    ).not.toThrow()
  })

  it('still lets the account change its name, or resend its own email unchanged', () => {
    expect(() => run({ name: 'New Name' }, customer)).not.toThrow()
    expect(() => run({ email: 'GUEST@example.com ' }, customer)).not.toThrow()
  })

  it('never lets an account mark itself verified', () => {
    expect(() => run({ _verified: true }, customer)).toThrow(/verification/)
  })

  it('applies to partners the same way', () => {
    const partner = { id: 7, collection: 'business-users', email: 'venue@example.com' }
    expect(() => run({ password: 'x'.repeat(12) }, partner, { slug: 'business-users' })).toThrow(
      /current password/,
    )
  })
})

describe('changes that are not self-updates', () => {
  it('lets staff edit an account', () => {
    expect(() => run({ email: 'fixed@example.com', password: 'reset-123456' }, staff)).not.toThrow()
  })

  it('lets server-side writes with nobody signed in through', () => {
    expect(() => run({ email: 'anon@deleted.invalid' }, undefined)).not.toThrow()
  })

  it('ignores operations other than update', () => {
    expect(() => run({ password: 'x' }, customer, { operation: 'create' })).not.toThrow()
  })
})
