import { describe, expect, it } from 'vitest'
import { guardAccountIdentity } from './guardAccountIdentity'

/**
 * Staff may edit partner and customer accounts, but only an admin changes
 * their sign-in. Before this, a staff member could set a venue's email and
 * password and walk into its dashboard.
 */

type Args = Parameters<typeof guardAccountIdentity>[0]

const staff = { id: 1, collection: 'users', roles: ['staff'] }
const admin = { id: 2, collection: 'users', roles: ['admin'] }
const partner = { id: 7, collection: 'business-users' }

const stored = { id: 7, email: 'venue@example.com', _verified: true }

const run = (
  data: Record<string, unknown>,
  user: unknown,
  { operation = 'update', id = 7 as number | undefined } = {},
) =>
  guardAccountIdentity({
    args: { data, id },
    operation,
    collection: { slug: 'business-users' },
    req: { user, payload: { findByID: async () => stored } },
  } as unknown as Args)

describe("staff changing somebody else's sign-in", () => {
  it('is refused for a new email, a password or verification', async () => {
    await expect(run({ email: 'thief@example.com' }, staff)).rejects.toThrow(/Only an admin/)
    await expect(run({ password: 'new-password-123' }, staff)).rejects.toThrow(/password/)
    await expect(run({ _verified: false }, staff)).rejects.toThrow(/verified/)
  })

  it('lets the admin panel save everything else, unchanged email included', async () => {
    await expect(
      run(
        { name: 'New name', phone: '+961 1 000 000', email: 'VENUE@example.com ', _verified: true },
        staff,
      ),
    ).resolves.toBeDefined()
  })

  it('refuses an email in a bulk update, which is never an ordinary edit', async () => {
    await expect(run({ email: 'x@example.com' }, staff, { id: undefined })).rejects.toThrow(
      /Only an admin/,
    )
  })
})

describe('who it does not apply to', () => {
  it('lets an admin change it', async () => {
    await expect(
      run({ email: 'new@example.com', password: 'x'.repeat(12) }, admin),
    ).resolves.toBeDefined()
  })

  it('leaves the account itself to guardSelfAccountUpdate', async () => {
    await expect(run({ email: 'new@example.com' }, partner)).resolves.toBeDefined()
  })

  it('lets scripts and the reset-password flow through, which have no user', async () => {
    await expect(run({ password: 'x'.repeat(12) }, null)).resolves.toBeDefined()
  })

  it('does nothing on create, where staff set the email to invite someone', async () => {
    await expect(
      run({ email: 'new@example.com' }, staff, { operation: 'create' }),
    ).resolves.toBeDefined()
  })
})
