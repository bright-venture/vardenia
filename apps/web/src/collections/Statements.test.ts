import { describe, expect, it } from 'vitest'
import type { Access, FieldAccess } from 'payload'
import { STATEMENT_MOVES, Statements, readStatements } from './Statements'

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

describe('what cannot change once a statement exists', () => {
  type Loose = { name?: string; fields?: Loose[]; access?: { update?: FieldAccess } }
  const all = (fields: Loose[]): Loose[] =>
    fields.flatMap((f) => (f.fields ? [f, ...all(f.fields)] : [f]))
  const field = (name: string) =>
    all(Statements.fields as unknown as Loose[]).find((f) => f.name === name)!
  const ctx = (doc?: unknown) => ({ req: { user: staff }, doc }) as Parameters<FieldAccess>[0]

  it('keeps the venue and the month, whoever asks', () => {
    for (const name of ['business', 'period']) {
      expect(field(name).access!.update!(ctx({ status: 'draft' }))).toBe(false)
    }
  })

  it('lets VAT change only while the statement is a draft', () => {
    const vat = field('vatRate').access!.update!
    expect(vat(ctx({ status: 'draft' }))).toBe(true)
    expect(vat(ctx({ status: 'sent' }))).toBe(false)
    expect(vat(ctx({ status: 'paid' }))).toBe(false)
  })

  it('only moves forward, with a mistaken payment the one way back', () => {
    expect(STATEMENT_MOVES.draft).toEqual(['sent', 'void'])
    expect(STATEMENT_MOVES.sent).toEqual(['paid', 'void'])
    expect(STATEMENT_MOVES.paid).toEqual(['sent'])
    expect(STATEMENT_MOVES.void).toEqual([])
  })
})
