import { describe, expect, it } from 'vitest'
import type { Where } from 'payload'
import {
  DEFAULT_FILTERS,
  filterQuery,
  isFiltered,
  parseSheetFilters,
  PRINTED_TIERS,
  sheetWhere,
} from './qr-sheet-filters'

/**
 * The filters behind the QR sheet and the QR export.
 *
 * Both routes read the query string through this one parser and build their
 * query with this one `where`, which is what makes "download all" give exactly
 * the codes on screen. The where clauses were also run against the development
 * database when this was written: every one of them is a query Payload
 * accepts, including the one that is not obvious (a kind of place must not be
 * compared with the code's own category, whose enum holds sections only).
 */

const parse = (query: string) => parseSheetFilters(new URLSearchParams(query))
const clauses = (where: Where) => (where.and ?? []) as Where[]

describe('parseSheetFilters', () => {
  it('defaults to active codes that go to print, by code, 48 a page', () => {
    const { filters, problems } = parse('')
    expect(filters).toEqual(DEFAULT_FILTERS)
    expect(problems).toEqual([])
  })

  it('reads every filter', () => {
    const { filters, problems } = parse(
      'q=byblos&placement=t-shirt&target=home&issue=3&article=10&governorate=north-lebanon&district=batroun&category=hotels&tier=silver&batch=import-2026-09-25&status=all&scans=never&print=all&sort=scans&per=200&size=40&page=2',
    )
    expect(problems).toEqual([])
    expect(filters).toEqual({
      q: 'byblos',
      placement: 't-shirt',
      target: 'home',
      issue: 3,
      article: 10,
      governorate: 'north-lebanon',
      district: 'batroun',
      category: 'hotels',
      tier: 'silver',
      batch: 'import-2026-09-25',
      status: 'all',
      scans: 'never',
      printOnly: false,
      sort: 'scans',
      page: 2,
      perPage: 200,
      size: 40,
    })
  })

  it('accepts "none" for codes in no issue', () => {
    expect(parse('issue=none').filters.issue).toBe('none')
  })

  it('reports nonsense instead of crashing on it, and ignores it', () => {
    const { filters, problems } = parse(
      'issue=abc&article=1.5&governorate=nowhere&district=x&category=y&placement=billboard',
    )
    expect(problems).toHaveLength(6)
    expect(filters.issue).toBeNull()
    expect(filters.article).toBeNull()
    expect(filters.governorate).toBeNull()
    expect(filters.category).toBeNull()
    expect(filters.placement).toBeNull()
  })

  it('falls back to a safe page size and page', () => {
    const { filters } = parse('per=100000&page=-3')
    expect(filters.perPage).toBe(48)
    expect(filters.page).toBe(1)
  })
})

describe('sheetWhere', () => {
  it('by default: active, and not a website-only listing', () => {
    expect(sheetWhere(DEFAULT_FILTERS)).toEqual({
      and: [
        { active: { equals: true } },
        { or: [{ business: { exists: false } }, { 'business.tier': { in: PRINTED_TIERS } }] },
      ],
    })
  })

  it('drops both defaults when asked for everything', () => {
    expect(sheetWhere(parse('status=all&print=all').filters)).toEqual({})
  })

  it('finds a region through the listing or the article', () => {
    expect(clauses(sheetWhere(parse('governorate=north-lebanon').filters))).toContainEqual({
      or: [
        { 'business.governorate': { equals: 'north-lebanon' } },
        { 'article.governorate': { equals: 'north-lebanon' } },
      ],
    })
  })

  it('treats a section and a kind of place differently', () => {
    expect(clauses(sheetWhere(parse('category=hospitality').filters))).toContainEqual({
      or: [
        { 'business.category': { equals: 'hospitality' } },
        { 'article.category': { equals: 'hospitality' } },
        { category: { equals: 'hospitality' } },
      ],
    })
    // Never `category: hotels`: that column's enum holds sections, and Postgres
    // refuses the comparison outright rather than matching nothing.
    expect(clauses(sheetWhere(parse('category=hotels').filters))).toContainEqual({
      'business.subcategories': { in: ['hotels'] },
    })
  })

  it('includes the listings an article features', () => {
    expect(clauses(sheetWhere(parse('article=10').filters, [4, 5]))).toContainEqual({
      or: [{ article: { equals: 10 } }, { business: { in: [4, 5] } }],
    })
    expect(clauses(sheetWhere(parse('article=10').filters, []))).toContainEqual({
      or: [{ article: { equals: 10 } }],
    })
  })

  it('searches the code exactly, even typed loosely', () => {
    const search = clauses(sheetWhere(parse('q=0o3t5d1').filters)).find(
      (c) => 'or' in c && JSON.stringify(c).includes('location'),
    )
    expect(search?.or).toContainEqual({ code: { equals: '003T5D1' } })
  })

  it('separates codes never scanned from scanned ones', () => {
    expect(clauses(sheetWhere(parse('scans=scanned').filters))).toContainEqual({
      scanCount: { greater_than: 0 },
    })
    expect(clauses(sheetWhere(parse('scans=never').filters))).toContainEqual({
      or: [{ scanCount: { equals: 0 } }, { scanCount: { exists: false } }],
    })
  })
})

describe('filterQuery', () => {
  const filters = parse('governorate=beirut&category=hotels&page=3&per=96').filters

  it('keeps the other filters and goes back to page 1 when one changes', () => {
    expect(filterQuery(filters, { category: null })).toBe('?governorate=beirut&per=96')
  })

  it('keeps the page when the page is what changes', () => {
    expect(filterQuery(filters, { page: '4' })).toBe(
      '?governorate=beirut&category=hotels&per=96&page=4',
    )
  })

  it('leaves the defaults out, so a clean sheet has a clean URL', () => {
    expect(filterQuery(DEFAULT_FILTERS)).toBe('')
  })
})

describe('isFiltered', () => {
  it('is about what narrows the list, not how it is arranged', () => {
    expect(isFiltered(parse('sort=scans&per=200&size=40&page=2').filters)).toBe(false)
    expect(isFiltered(parse('tier=silver').filters)).toBe(true)
    expect(isFiltered(parse('status=all').filters)).toBe(true)
  })
})
