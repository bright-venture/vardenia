import type { Where } from 'payload'
import {
  can,
  CATEGORIES,
  GOVERNORATES,
  LISTING_TIERS,
  normalizeCode,
  QR_TARGET_TYPES,
  type QrPlacement,
  type QrTargetType,
} from '@vardenia/core'
import { parsePlacement } from './qr-doc'

/**
 * The filters on the QR sheet and the QR export, read off the query string.
 *
 * One parser and one `where` for both routes, so "download all" always gives
 * exactly the codes the sheet is showing. The two used to filter separately,
 * and a filter added to one and not the other is a folder of the wrong files
 * that nobody notices until the layout.
 *
 * Everything here is pure: the routes do the database work, and the tests can
 * check every filter without one.
 */

export type SheetStatus = 'active' | 'inactive' | 'all'
export type SheetScans = 'any' | 'scanned' | 'never'
export type SheetSort = 'code' | 'scans' | 'newest' | 'oldest'

export const PER_PAGE_OPTIONS = [24, 48, 96, 200, 500] as const
export const DEFAULT_PER_PAGE = 48

export interface SheetFilters {
  /** Free text: the code, the listing's name, the article's title, a shirt's location. */
  q: string | null
  placement: QrPlacement | null
  /** What the code opens. */
  target: QrTargetType | null
  /** An issue id, or 'none' for codes not tied to any issue. */
  issue: number | 'none' | null
  /** Codes that open this article, and codes for the listings it features. */
  article: number | null
  governorate: string | null
  district: string | null
  /** A section slug (hospitality) or a kind of place (hotels). */
  category: string | null
  tier: string | null
  batch: string | null
  status: SheetStatus
  scans: SheetScans
  /**
   * True (the default) leaves out codes whose listing is on a tier without
   * print. Those codes stay active, because they may be on paper from an earlier
   * issue, but they are not printed again. See goesToPrint.
   */
  printOnly: boolean
  sort: SheetSort
  page: number
  perPage: number
  /** Printed size in millimetres, or null for the default. */
  size: number | null
}

export const DEFAULT_FILTERS: SheetFilters = {
  q: null,
  placement: null,
  target: null,
  issue: null,
  article: null,
  governorate: null,
  district: null,
  category: null,
  tier: null,
  batch: null,
  status: 'active',
  scans: 'any',
  printOnly: true,
  sort: 'code',
  page: 1,
  perPage: DEFAULT_PER_PAGE,
  size: null,
}

/**
 * A positive whole number, or null.
 *
 * Deliberately strict. `Number('1.5')` and `Number(' 1 ')` both produce
 * something a careless check would accept and Postgres would then reject, so
 * the string has to look like an id rather than merely coerce to one.
 */
export function parseIssueId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

const GOVERNORATE_SLUGS = new Set<string>(GOVERNORATES.map((g) => g.slug))
const DISTRICT_SLUGS = new Set<string>(GOVERNORATES.flatMap((g) => g.districts.map((d) => d.slug)))
const SECTION_SLUGS = new Set<string>(CATEGORIES.map((c) => c.slug))
const KIND_SLUGS = new Set<string>(CATEGORIES.flatMap((c) => c.children.map((child) => child.slug)))

/** Tiers whose listings have a printed code. Today: silver. */
export const PRINTED_TIERS: string[] = LISTING_TIERS.filter((tier) => can(tier, 'qrCode'))

const pick = <T extends string>(raw: string | null, allowed: readonly T[]): T | null =>
  raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null

const text = (raw: string | null, max = 120): string | null => {
  const value = raw?.trim().slice(0, max)
  return value ? value : null
}

export interface ParsedFilters {
  filters: SheetFilters
  /** Values that were given but mean nothing. Shown on the sheet, never a crash. */
  problems: string[]
}

export function parseSheetFilters(params: URLSearchParams): ParsedFilters {
  const problems: string[] = []
  const get = (key: string) => {
    const value = params.get(key)
    return value === null || value === '' ? null : value
  }

  let issue: SheetFilters['issue'] = null
  const issueRaw = get('issue')
  if (issueRaw === 'none') issue = 'none'
  else if (issueRaw !== null) {
    issue = parseIssueId(issueRaw)
    if (issue === null) problems.push(`"${issueRaw}" is not an issue id.`)
  }

  const articleRaw = get('article')
  const article = parseIssueId(articleRaw)
  if (articleRaw !== null && article === null)
    problems.push(`"${articleRaw}" is not an article id.`)

  const governorate = get('governorate')
  const district = get('district')
  const category = get('category')
  if (governorate && !GOVERNORATE_SLUGS.has(governorate))
    problems.push(`Unknown governorate "${governorate}".`)
  if (district && !DISTRICT_SLUGS.has(district)) problems.push(`Unknown district "${district}".`)
  if (category && !SECTION_SLUGS.has(category) && !KIND_SLUGS.has(category)) {
    problems.push(`Unknown category "${category}".`)
  }

  const placementRaw = get('placement')
  const placement = parsePlacement(placementRaw)
  if (placementRaw && !placement) problems.push(`Unknown placement "${placementRaw}".`)

  const perRaw = Number(get('per'))
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perRaw)
    ? perRaw
    : DEFAULT_PER_PAGE

  const pageRaw = parseIssueId(get('page'))
  const sizeRaw = Number(get('size'))

  return {
    filters: {
      q: text(get('q')),
      placement,
      target: pick(get('target'), QR_TARGET_TYPES),
      issue,
      article,
      governorate: governorate && GOVERNORATE_SLUGS.has(governorate) ? governorate : null,
      district: district && DISTRICT_SLUGS.has(district) ? district : null,
      category:
        category && (SECTION_SLUGS.has(category) || KIND_SLUGS.has(category)) ? category : null,
      tier: pick(get('tier'), LISTING_TIERS),
      batch: text(get('batch')),
      status: pick(get('status'), ['active', 'inactive', 'all'] as const) ?? 'active',
      scans: pick(get('scans'), ['any', 'scanned', 'never'] as const) ?? 'any',
      printOnly: get('print') !== 'all',
      sort: pick(get('sort'), ['code', 'scans', 'newest', 'oldest'] as const) ?? 'code',
      page: pageRaw ?? 1,
      perPage,
      size: Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : null,
    },
    problems,
  }
}

export const SORT_FIELD: Record<SheetSort, string> = {
  code: 'code',
  scans: '-scanCount',
  newest: '-createdAt',
  oldest: 'createdAt',
}

/**
 * The Payload query for a set of filters.
 *
 * `featuredIds` are the listings the chosen article features, looked up by the
 * route first: "codes in this article" means the article's own code and the
 * codes of every listing it shows, since a listing's code is printed beside its
 * story.
 *
 * Listing fields are reached through the code's `business` relationship, and
 * the region and category also through `article`, so a filter by governorate
 * finds a code for a listing in Batroun and a code for a story about Batroun.
 */
export function sheetWhere(filters: SheetFilters, featuredIds: number[] = []): Where {
  const and: Where[] = []

  if (filters.status === 'active') and.push({ active: { equals: true } })
  if (filters.status === 'inactive') and.push({ active: { not_equals: true } })

  if (filters.placement) and.push({ placement: { equals: filters.placement } })
  if (filters.target) and.push({ targetType: { equals: filters.target } })

  if (filters.issue === 'none') and.push({ issue: { exists: false } })
  else if (filters.issue !== null) and.push({ issue: { equals: filters.issue } })

  if (filters.article !== null) {
    and.push({
      or: [
        { article: { equals: filters.article } },
        ...(featuredIds.length > 0 ? [{ business: { in: featuredIds } }] : []),
      ],
    })
  }

  if (filters.governorate) {
    and.push({
      or: [
        { 'business.governorate': { equals: filters.governorate } },
        { 'article.governorate': { equals: filters.governorate } },
      ],
    })
  }
  if (filters.district) and.push({ 'business.district': { equals: filters.district } })

  if (filters.category) {
    and.push(
      SECTION_SLUGS.has(filters.category)
        ? {
            or: [
              { 'business.category': { equals: filters.category } },
              { 'article.category': { equals: filters.category } },
              { category: { equals: filters.category } },
            ],
          }
        : // A kind of place only. The code's own `category` holds sections, and
          // comparing that enum column to "hotels" is an SQL error, not a miss.
          { 'business.subcategories': { in: [filters.category] } },
    )
  }

  if (filters.tier) and.push({ 'business.tier': { equals: filters.tier } })
  if (filters.batch) and.push({ 'business.importBatch': { equals: filters.batch } })

  if (filters.scans === 'scanned') and.push({ scanCount: { greater_than: 0 } })
  if (filters.scans === 'never') {
    and.push({ or: [{ scanCount: { equals: 0 } }, { scanCount: { exists: false } }] })
  }

  if (filters.printOnly) {
    and.push({
      or: [{ business: { exists: false } }, { 'business.tier': { in: PRINTED_TIERS } }],
    })
  }

  if (filters.q) {
    const code = normalizeCode(filters.q)
    and.push({
      or: [
        ...(code ? [{ code: { equals: code } }] : []),
        { code: { like: filters.q.toUpperCase() } },
        { location: { like: filters.q } },
        { externalUrl: { like: filters.q } },
        { 'business.name': { like: filters.q } },
        { 'article.title': { like: filters.q } },
      ],
    })
  }

  return and.length === 0 ? {} : { and }
}

/** Keys in the order they appear in a URL, so links are stable and readable. */
const KEYS = [
  'q',
  'placement',
  'target',
  'issue',
  'article',
  'governorate',
  'district',
  'category',
  'tier',
  'batch',
  'status',
  'scans',
  'print',
  'sort',
  'per',
  'size',
  'page',
] as const
export type FilterKey = (typeof KEYS)[number]
type Key = FilterKey

/** The filters as query parameters, leaving out every default. */
export function filterParams(filters: SheetFilters): Partial<Record<Key, string>> {
  const out: Partial<Record<Key, string>> = {}
  if (filters.q) out.q = filters.q
  if (filters.placement) out.placement = filters.placement
  if (filters.target) out.target = filters.target
  if (filters.issue !== null) out.issue = String(filters.issue)
  if (filters.article !== null) out.article = String(filters.article)
  if (filters.governorate) out.governorate = filters.governorate
  if (filters.district) out.district = filters.district
  if (filters.category) out.category = filters.category
  if (filters.tier) out.tier = filters.tier
  if (filters.batch) out.batch = filters.batch
  if (filters.status !== 'active') out.status = filters.status
  if (filters.scans !== 'any') out.scans = filters.scans
  if (!filters.printOnly) out.print = 'all'
  if (filters.sort !== 'code') out.sort = filters.sort
  if (filters.perPage !== DEFAULT_PER_PAGE) out.per = String(filters.perPage)
  if (filters.size !== null) out.size = String(filters.size)
  if (filters.page !== 1) out.page = String(filters.page)
  return out
}

/**
 * A query string for these filters with some keys changed or removed.
 *
 * Changing any filter goes back to page 1 unless a page is given, because page
 * 7 of a narrower list is usually empty.
 */
export function filterQuery(
  filters: SheetFilters,
  changes: Partial<Record<Key, string | null>> = {},
): string {
  const params = { ...filterParams(filters) } as Partial<Record<Key, string>>
  if (!('page' in changes)) delete params.page
  for (const [key, value] of Object.entries(changes) as [Key, string | null][]) {
    if (value === null || value === '') delete params[key]
    else params[key] = value
  }
  const search = new URLSearchParams()
  for (const key of KEYS) if (params[key] !== undefined) search.set(key, params[key] as string)
  const out = search.toString()
  return out ? `?${out}` : ''
}

/** The keys that narrow the list. Sort, page size and print size only arrange it. */
const NARROWING: Key[] = [
  'q',
  'placement',
  'target',
  'issue',
  'article',
  'governorate',
  'district',
  'category',
  'tier',
  'batch',
  'status',
  'scans',
  'print',
]

/** True when anything narrows the list beyond the defaults. */
export function isFiltered(filters: SheetFilters): boolean {
  const params = filterParams(filters)
  return NARROWING.some((key) => params[key] !== undefined)
}
