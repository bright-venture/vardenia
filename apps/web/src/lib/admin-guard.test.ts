import { describe, expect, it } from 'vitest'
import { adminRedirectFor, tokenCollection } from './admin-guard'

/**
 * This decides whether a request reaches the admin panel, so the test that
 * matters most is not the redirect - it is everything that must *not* be
 * redirected. A middleware that guesses wrong here takes down the whole back
 * office, and it would do it for staff only, on production, in a way no unit
 * test of the happy path would notice.
 */

/** A token shaped like Payload's, carrying whatever claims a test needs. */
const token = (claims: Record<string, unknown>) => {
  const body = Buffer.from(JSON.stringify(claims))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return `header.${body}.signature`
}

describe('tokenCollection', () => {
  it('reads the collection a token was minted against', () => {
    expect(tokenCollection(token({ id: 1, collection: 'customers' }))).toBe('customers')
    expect(tokenCollection(token({ id: 1, collection: 'users' }))).toBe('users')
  })

  it('survives a payload that needs base64 padding', () => {
    // Lengths that are not a multiple of four are the ones `atob` rejects, so
    // the claim is padded out to several different remainders.
    for (const email of ['a@b.co', 'ab@b.co', 'abc@b.co', 'abcd@b.co']) {
      expect(tokenCollection(token({ collection: 'customers', email }))).toBe('customers')
    }
  })

  it.each([
    ['nothing at all', undefined],
    ['an empty string', ''],
    ['something that is not a JWT', 'not-a-token'],
    ['the wrong number of segments', 'only.two'],
    ['a payload that is not base64', 'header.!!!!.signature'],
    ['a payload that is not JSON', `header.${Buffer.from('hello').toString('base64url')}.sig`],
  ])('returns null for %s', (_name, value) => {
    expect(tokenCollection(value)).toBeNull()
  })

  it('returns null when there is no collection claim', () => {
    expect(tokenCollection(token({ id: 1 }))).toBeNull()
    expect(tokenCollection(token({ collection: 42 }))).toBeNull()
  })
})

describe('adminRedirectFor', () => {
  /**
   * The two that must never be intercepted. Staff would lose the admin panel
   * entirely, and a signed-out visitor needs Payload's own login screen -
   * redirecting them would mean building a second one.
   */
  it('lets staff through', () => {
    expect(adminRedirectFor(token({ collection: 'users' }))).toBeNull()
  })

  it('lets a request with no session through, so Payload can offer its login', () => {
    expect(adminRedirectFor(undefined)).toBeNull()
    expect(adminRedirectFor('')).toBeNull()
  })

  it('lets an unreadable token through rather than guessing', () => {
    expect(adminRedirectFor('garbage')).toBeNull()
  })

  it('sends a customer to their account, where sign-out works', () => {
    expect(adminRedirectFor(token({ collection: 'customers' }))).toBe('/account')
  })

  it('sends an owner to their dashboard', () => {
    expect(adminRedirectFor(token({ collection: 'business-users' }))).toBe('/partner')
  })

  /**
   * A new auth collection added later must not inherit the dead end by default.
   * The account page is a harmless place to land.
   */
  it('moves an unrecognised collection along anyway', () => {
    expect(adminRedirectFor(token({ collection: 'suppliers' }))).toBe('/account')
  })
})
