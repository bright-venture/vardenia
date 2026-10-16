import { describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'
import { BusinessUsers } from './BusinessUsers'
import { Customers } from './Customers'
import { Users } from './Users'

/**
 * Signing other devices out when a password changes depends on sessions.
 *
 * With sessions on, Payload 3.90 records each sign-in on the account and checks
 * it on every request. Resetting a password empties that list (every device is
 * signed out), and changing it while signed in keeps only the session that made
 * the change (app/auth/profile). With sessions off, a login is a bare token that
 * stays valid until it expires, and a stolen session would outlive the password
 * change meant to end it. lib/account-deletion's revokeAllSessions depends on
 * the same list.
 *
 * Payload's default is on. This fails if any account collection turns it off.
 */
describe('sessions on every account collection', () => {
  it.each([
    ['customers', Customers],
    ['business-users', BusinessUsers],
    ['users', Users],
  ] as [string, CollectionConfig][])('%s keeps sessions on', (_, collection) => {
    const auth = collection.auth
    expect(auth).toBeTruthy()
    expect(typeof auth === 'object' ? auth.useSessions : undefined).not.toBe(false)
  })
})
