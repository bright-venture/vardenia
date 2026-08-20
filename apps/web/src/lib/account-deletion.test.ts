import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { anonymisedCustomer, closeCustomerAccount, isClosed } from './account-deletion'

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

/**
 * The writes must not join the caller's transaction.
 *
 * closeRatherThanDelete calls this and then throws, to stop the admin panel's
 * Delete button going through to the row. Payload rolls its transaction back on
 * the way out of a failed operation, so a write that had joined it would be
 * undone - and the account would report itself closed while still carrying the
 * customer's name and address.
 *
 * Threading `req` through here is the natural tidying-up instinct and it would
 * break that silently, in the one place nobody would look. Hence this test.
 */
describe('closeCustomerAccount', () => {
  function harness(bookings: Record<string, unknown>[] = []) {
    const calls: Record<string, unknown>[] = []

    const payload = {
      find: vi.fn(async () => ({ docs: bookings, totalDocs: bookings.length })),
      update: vi.fn(async (args: Record<string, unknown>) => {
        calls.push(args)
        return {}
      }),
    } as unknown as Payload

    return { payload, calls }
  }

  it('opens its own transaction for every write', async () => {
    const { payload, calls } = harness([{ id: 1, notes: 'nut allergy' }])

    await closeCustomerAccount(payload, 7)

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call).not.toHaveProperty('req')
    }
  })

  it('clears the notes on every booking, not only the cancelled ones', async () => {
    const { payload, calls } = harness([
      { id: 1, notes: 'wheelchair access' },
      { id: 2, notes: null },
    ])

    await closeCustomerAccount(payload, 7)

    const cleared = calls.filter((c) => (c.data as { notes?: unknown })?.notes === null)
    expect(cleared).toHaveLength(1)
    expect(cleared[0]?.id).toBe(1)
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
