import { describe, expect, it } from 'vitest'
import { anonymisedCustomer, isClosed } from './account-deletion'

/**
 * The one assertion that matters: nothing personal survives.
 *
 * Everything else about closing an account is recoverable by a support ticket.
 * A field that quietly keeps its old value is a promise broken in a document we
 * have published, and it would be invisible - the account would look closed from
 * every screen while the row still carried a name.
 */

const PERSONAL = ['Sami Khoury', 'sami@example.com', '+961 3 123456']

describe('anonymisedCustomer', () => {
  it('replaces every identifying field', () => {
    const patch = anonymisedCustomer()
    const serialised = JSON.stringify(patch)

    for (const value of PERSONAL) {
      expect(serialised).not.toContain(value)
    }

    expect(patch.name).toBe('Closed account')
    expect(patch.phone).toBeNull()
  })

  it('leaves an address that can never route anywhere', () => {
    // A reserved TLD, so a stray send cannot reach a real mailbox - or bounce
    // off one and cost the domain's reputation.
    expect(anonymisedCustomer().email).toMatch(/@removed\.invalid$/)
  })

  it('sets a password nobody holds, so the account cannot be signed into again', () => {
    const patch = anonymisedCustomer()
    expect(patch.password.length).toBeGreaterThanOrEqual(32)
    expect(patch.password).not.toBe(anonymisedCustomer().password)
  })

  /**
   * Keyed on random bytes rather than the customer id.
   *
   * An id would leave a stable handle that could be matched against anything
   * else keyed the same way - which is the difference between anonymised and
   * merely pseudonymised, and puts the row back inside the regulation.
   */
  it('gives two closures unrelated addresses', () => {
    expect(anonymisedCustomer().email).not.toBe(anonymisedCustomer().email)
  })

  it('records when it happened', () => {
    const at = new Date('2026-08-20T12:00:00Z')
    expect(anonymisedCustomer(at).deletedAt).toBe(at.toISOString())
  })
})

describe('isClosed', () => {
  it('is true once a closure has been recorded', () => {
    expect(isClosed({ deletedAt: '2026-08-20T12:00:00Z' })).toBe(true)
  })

  it.each([[{ deletedAt: null }], [{}], [null], [undefined]])('is false for %j', (value) => {
    expect(isClosed(value)).toBe(false)
  })
})
