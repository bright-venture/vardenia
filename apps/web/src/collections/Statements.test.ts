import { describe, expect, it } from 'vitest'
import type { Access, FieldAccess } from 'payload'
import { Statements, readStatements } from './Statements'

/**
 * Who can see a venue's statements.
 *
 * An invoice is a business's own money, so the rule has two edges worth
 * pinning: an owner sees only the venues they manage, and never a draft, which
 * is the team's working copy.
 */

const read = (user: unknown) => readStatements({ req: { user } } as Parameters<Access>[0])

const staff = { id: 2, collection: 'users', roles: ['staff'] }
const owner = { id: 7, collection: 'business-users', businesses: [11, { id: 12 }] }

describe('reading statements', () => {
  it('shows staff everything', () => {
    expect(read(staff)).toBe(true)
  })

  it('shows an owner their own venues, sent or paid, and no drafts', () => {
    expect(read(owner)).toEqual({
      and: [{ business: { in: [11, 12] } }, { status: { in: ['sent', 'paid'] } }],
    })
  })

  it('shows nothing to an owner with no venue, a customer, or nobody', () => {
    expect(read({ id: 8, collection: 'business-users', businesses: [] })).toBe(false)
    expect(read({ id: 3, collection: 'customers' })).toBe(false)
    expect(read(null)).toBe(false)
  })
})

describe('writing statements', () => {
  const access = Statements.access!
  const ctx = (user: unknown) => ({ req: { user } }) as Parameters<Access>[0]

  it('lets only staff create or change one; owners go through /billing/dispute', () => {
    expect(access.create!(ctx(staff))).toBe(true)
    expect(access.update!(ctx(staff))).toBe(true)
    expect(access.create!(ctx(owner))).toBe(false)
    expect(access.update!(ctx(owner))).toBe(false)
  })

  it('keeps the internal notes from the venue', () => {
    const notes = Statements.fields.find(
      (field) => 'name' in field && field.name === 'internalNotes',
    ) as { access?: { read?: FieldAccess } }
    const fieldCtx = (user: unknown) => ({ req: { user } }) as Parameters<FieldAccess>[0]
    expect(notes.access?.read?.(fieldCtx(owner))).toBe(false)
    expect(notes.access?.read?.(fieldCtx(staff))).toBe(true)
  })
})
