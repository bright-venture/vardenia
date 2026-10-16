import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { isStaffRequest, staffUser } from './billing-auth'

/**
 * Who the staff-only routes let in: billing, the invoice, the reports and the
 * QR sheet and export all ask this one question.
 */

const payloadAs = (user: unknown) => ({ auth: async () => ({ user }) }) as unknown as Payload

const headers = new Headers()

describe('staffUser', () => {
  it('lets in staff and admins from the staff collection', async () => {
    for (const roles of [['staff'], ['admin']]) {
      const user = { id: 1, collection: 'users', roles }
      await expect(staffUser(payloadAs(user), headers)).resolves.toBe(user)
    }
  })

  /**
   * The reason the routes no longer read `roles` themselves: a customer or a
   * partner given a `roles` field, by a schema change or a bad import, must
   * still not pass for staff.
   */
  it('never lets in a customer or partner that carries an admin role', async () => {
    for (const collection of ['customers', 'business-users']) {
      const user = { id: 1, collection, roles: ['admin'] }
      await expect(staffUser(payloadAs(user), headers)).resolves.toBeNull()
    }
  })

  it('refuses the signed-out, a staff account with no role, and a failed lookup', async () => {
    await expect(staffUser(payloadAs(null), headers)).resolves.toBeNull()
    await expect(
      staffUser(payloadAs({ id: 1, collection: 'users', roles: [] }), headers),
    ).resolves.toBeNull()
    const broken = { auth: async () => Promise.reject(new Error('db down')) } as unknown as Payload
    await expect(staffUser(broken, headers)).resolves.toBeNull()
  })

  it('answers the yes-or-no form the same way', async () => {
    await expect(
      isStaffRequest(payloadAs({ id: 1, collection: 'users', roles: ['staff'] }), headers),
    ).resolves.toBe(true)
    await expect(
      isStaffRequest(payloadAs({ id: 1, collection: 'customers', roles: ['admin'] }), headers),
    ).resolves.toBe(false)
  })
})
