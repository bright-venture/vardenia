import { describe, expect, it } from 'vitest'
import type { Where } from 'payload'
import { phoneSearchTerm, phoneSearchValue, rewriteStaffSearch } from './owner-phone-search'

describe('phoneSearchValue (what is stored for searching)', () => {
  it.each(['03 123 456', '+961 3 123 456', '00961 3 123 456', '03-123-456', '(03) 123.456'])(
    '%s is stored as 03123456',
    (input) => {
      expect(phoneSearchValue(input)).toBe('03123456')
    },
  )

  it('keeps only the digits of a number that is not Lebanese', () => {
    expect(phoneSearchValue('+44 20 7946 0958')).toBe('442079460958')
  })

  it('stores nothing for an empty or missing phone', () => {
    expect(phoneSearchValue('')).toBeNull()
    expect(phoneSearchValue('call me')).toBeNull()
    expect(phoneSearchValue(undefined)).toBeNull()
  })
})

describe('phoneSearchTerm (what is looked for)', () => {
  it('a search for 03 123 456 becomes the stored shape, so it finds +961 3 123 456 and the reverse', () => {
    const stored = phoneSearchValue('+961 3 123 456')
    expect(phoneSearchTerm('03 123 456')).toBe(stored)
    expect(phoneSearchTerm('+961 3 123 456')).toBe(phoneSearchValue('03 123 456'))
    expect(phoneSearchTerm('3123456')).toBe(stored)
  })

  it('a part of a number is searched as its digits', () => {
    expect(phoneSearchTerm('123 456')).toBe('123456')
    expect('03123456'.includes(phoneSearchTerm('123 456'))).toBe(true)
  })

  it('text with letters is left alone', () => {
    expect(phoneSearchTerm('VD-123')).toBe('VD-123')
    expect(phoneSearchTerm('Cafe Cedar')).toBe('Cafe Cedar')
  })
})

/** The shape the admin builds for a search over listSearchableFields. */
const search = (term: string): Where => ({
  or: [
    { name: { like: term } },
    { listingNumber: { like: term } },
    { 'submission.reference': { like: term } },
    { 'submission.ownerPhone': { like: term } },
    { 'submission.ownerPhoneSearch': { like: term } },
  ],
})

const clauses = (where: Where | undefined) => (where?.or ?? []) as Record<string, unknown>[]

describe('rewriteStaffSearch', () => {
  it('normalises the phone term and leaves the raw columns on the original', () => {
    const out = clauses(rewriteStaffSearch(search('+961 3 123 456')))
    expect(out).toContainEqual({ 'submission.ownerPhoneSearch': { like: '03123456' } })
    expect(out).toContainEqual({ 'submission.ownerPhone': { like: '+961 3 123 456' } })
    expect(out).toContainEqual({ name: { like: '+961 3 123 456' } })
  })

  it('turns a whole-number term into an exact page-number match', () => {
    expect(clauses(rewriteStaffSearch(search('17')))).toContainEqual({
      listingNumber: { equals: 17 },
    })
  })

  it('drops the page-number clause for any other term (it would match every unnumbered listing)', () => {
    for (const term of ['VD-123', 'Cafe', '03 123 456', '1.5']) {
      const out = clauses(rewriteStaffSearch(search(term)))
      expect(out.some((c) => 'listingNumber' in c)).toBe(false)
      expect(out.some((c) => 'name' in c)).toBe(true)
    }
  })

  it('finds the clauses inside an and, next to a filter', () => {
    const where: Where = { and: [{ 'submission.status': { equals: 'pending' } }, search('Cafe')] }
    const out = rewriteStaffSearch(where) as { and: Where[] }
    expect(out.and[0]).toEqual({ 'submission.status': { equals: 'pending' } })
    expect((out.and[1]!.or as unknown[]).length).toBe(4)
  })

  it('returns the same object when there is nothing to rewrite', () => {
    const where: Where = { 'submission.status': { equals: 'pending' } }
    expect(rewriteStaffSearch(where)).toBe(where)
    expect(rewriteStaffSearch(undefined)).toBeUndefined()
  })
})
