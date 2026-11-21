import { randomBytes } from 'node:crypto'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'
import {
  MAX_BRANCHES_PER_BRAND,
  MAX_NEW_BRANCHES_PER_DAY,
  canHaveBrand,
  type BranchRequest,
} from '@vardenia/core'
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@vardenia/i18n'
import { slugify } from '../fields/slug'
import { uniqueViolation } from './db-errors'
import { reportError } from './report'
import { advisoryLock, partnerLockKey } from './partner-lock'

/**
 * A partner adds a branch of a restaurant they own (Task 9, 21 November 2026).
 * The door is POST /partner-data/branches (app/partner-data/branches).
 *
 * `businesses.create`, `brands.create` and `business-users.businesses` are
 * staff-only. This is the only code that writes them for a partner, with
 * `overrideAccess: true`, so it is the access rule, like lib/place-submission
 * for the public form:
 *
 * - Ownership is decided here, from the partner's row read fresh inside the
 *   transaction, never from the request body or a stale session.
 * - The branch is built from an explicit allow-list of the source listing's
 *   fields plus the request's place fields. Nothing is spread, so a smuggled
 *   tier, verified flag, slug, status, booking switch, QR code, contract or
 *   submission state cannot reach the record. Tier is left to its default.
 * - The media are the source's own ids, already attached to a listing of
 *   this partner: no new media rows.
 *
 * # All or nothing
 *
 * Every write (the brand, the source's link to it, the branch, its other
 * languages, the partner's list) runs on one request inside ONE database
 * transaction (runInTransaction), committed at the end. Any failure rolls the
 * lot back: no brand without a branch, no branch the partner cannot see, no
 * source linked to a brand that was never kept. Payload kills the shared
 * transaction when any nested operation fails, so after each step the
 * transaction is checked to be still alive and the work stops if it is not.
 *
 * # Limits, race-safe
 *
 * At most MAX_BRANCHES_PER_BRAND listings per brand (the source included) and
 * MAX_NEW_BRANCHES_PER_DAY new branches per partner in any 24 hours (counted
 * by createdAt among the partner's listings that this flow made, trashed ones
 * included; see step 3). Each
 * count runs after a transaction-scoped advisory lock: the partner's, then
 * the source's, then the brand's, always in that order (so two requests
 * cannot deadlock). Two requests of one partner therefore queue and the
 * second counts after the first has committed; two partners adding to one
 * brand queue on the brand's lock. Nothing else writes branches.
 *
 * # Slugs
 *
 * As in the public submission: the plain slug of the name, then the name with
 * the district (or governorate), then twice with four random hex characters.
 * Taken slugs (trashed listings included) are skipped before writing, so a
 * clash does not kill the transaction. If another save takes the slug between
 * that check and the insert, the whole branch is retried from scratch, up to
 * MAX_ATTEMPTS times. Brand slugs work the same way.
 */

export interface BranchPartner {
  id: number
  email: string
  name: string
  phone?: string | null
}

export type BranchRefusalCode = 'not-found' | 'not-restaurant' | 'brand-full' | 'daily-limit'

export type BranchOutcome =
  | {
      ok: true
      listingId: number
      brandId: number
      brandCreated: boolean
      brandName: string
      sourceName: string
    }
  | { ok: false; code: BranchRefusalCode | 'error'; status: number; message: string }

type TxRequest = PayloadRequest

export interface BranchDeps {
  /** Runs `fn` inside one transaction: commit on success, rollback on throw. */
  transaction?: <T>(fn: (req: TxRequest) => Promise<T>) => Promise<T>
  /** Takes a transaction-scoped lock on `key`. */
  lock?: (req: TxRequest, key: string) => Promise<void>
  now?: Date
  report?: typeof reportError
}

const MAX_ATTEMPTS = 3
const DAY_MS = 24 * 60 * 60 * 1000

const NOT_FOUND = 'That listing was not found among yours.'
const COULD_NOT_SAVE = 'We could not add that branch. Please try again.'

const REFUSALS: Record<BranchRefusalCode, { status: number; message: string }> = {
  'not-found': { status: 404, message: NOT_FOUND },
  'not-restaurant': { status: 400, message: 'Branches can only be added for restaurants.' },
  'brand-full': {
    status: 409,
    message: `A brand can have at most ${MAX_BRANCHES_PER_BRAND} branches. Please contact us to add more.`,
  },
  'daily-limit': {
    status: 429,
    message: `You can add at most ${MAX_NEW_BRANCHES_PER_DAY} branches a day. Please try again tomorrow.`,
  },
}

class Refusal extends Error {
  constructor(readonly code: BranchRefusalCode) {
    super(code)
  }
}

/** A unique slug refusal on a listing or a brand (Payload's form or the driver's). */
export function isAnySlugTaken(error: unknown): boolean {
  const named = uniqueViolation(error)
  return named === 'slug' || named === 'businesses_slug_idx' || named === 'brands_slug_idx'
}

/**
 * One transaction on a request of its own, with no user: the writes are the
 * system's (overrideAccess), and no partner-specific hook should see them as
 * the partner's.
 */
export async function runInTransaction<T>(
  payload: Payload,
  fn: (req: TxRequest) => Promise<T>,
): Promise<T> {
  const req = await createLocalReq({}, payload)
  const started = await initTransaction(req)
  if (!started) throw new Error('The database did not open a transaction.')
  try {
    const result = await fn(req)
    if (!req.transactionID) throw new Error('The transaction was rolled back by a nested write.')
    await commitTransaction(req)
    return result
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

export { advisoryLock } from './partner-lock'

// ---------------------------------------------------------------------------
// Reading the source in every language
// ---------------------------------------------------------------------------

const LOCALE_SET = new Set<string>(LOCALES)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A field read with `locale: 'all'` comes back as { en: ..., ar: ... }. */
const isLocaleMap = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  Object.keys(value).length > 0 &&
  Object.keys(value).every((k) => LOCALE_SET.has(k))

const present = (value: unknown) =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '')

/** The value written in exactly this locale (no fallback), or undefined. */
const valueIn = (value: unknown, locale: Locale): unknown => {
  const v = isLocaleMap(value) ? value[locale] : locale === DEFAULT_LOCALE ? value : undefined
  return present(v) ? v : undefined
}

const firstText = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value
  if (isLocaleMap(value)) {
    const own = value[DEFAULT_LOCALE]
    if (typeof own === 'string' && own.trim()) return own
    return Object.values(value).find((v): v is string => typeof v === 'string' && v.trim() !== '')
  }
  return undefined
}

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

const ids = (value: unknown): (number | string)[] =>
  Array.isArray(value) ? value.map(idOf).filter((id): id is number | string => id !== null) : []

interface SourceListing {
  id: number
  _status?: unknown
  submission?: unknown
  name?: unknown
  subcategories?: string[] | null
  category?: unknown
  tagline?: unknown
  description?: unknown
  heroImage?: unknown
  gallery?: unknown
  logo?: unknown
  menu?: unknown
  amenities?: unknown
  payments?: unknown
  contact?: unknown
  seatingAreas?: unknown
  brand?: unknown
}

type AreaRow = { setting?: unknown; smoking?: unknown; tables?: unknown; label?: unknown }

const areaRows = (value: unknown): AreaRow[] => (Array.isArray(value) ? (value as AreaRow[]) : [])

const PAYMENT_KEYS = ['cash', 'card', 'whish', 'omt'] as const

function copiedPayments(value: unknown) {
  if (!isRecord(value)) return undefined
  return Object.fromEntries(PAYMENT_KEYS.map((key) => [key, value[key] === true]))
}

function mergedContact(stored: unknown, sent: BranchRequest['contact']) {
  const out: Record<string, string> = {}
  if (isRecord(stored)) {
    for (const [key, value] of Object.entries(stored)) {
      if (key !== 'id' && typeof value === 'string' && value.trim()) out[key] = value
    }
  }
  for (const [key, value] of Object.entries(sent ?? {})) {
    if (typeof value === 'string' && value.trim()) out[key] = value
  }
  return out
}

const hex = () => randomBytes(2).toString('hex')

/** The brand name's cap (collections/Brands `maxLength`). */
export const BRAND_NAME_MAX = 160

/**
 * The characters a reader sees (grapheme clusters: an emoji with its
 * modifiers, a letter with its combining marks), or code points where the
 * runtime has no Intl.Segmenter.
 */
function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), (part) => part.segment)
  }
  return Array.from(text)
}

/**
 * A name cut to BRAND_NAME_MAX UTF-16 units, which is what Payload's
 * `maxLength` counts (`.length`), so 160 emoji (320 units) no longer fail the
 * brand's save. The cut falls between whole characters: never inside a
 * surrogate pair, and never between a letter and its combining marks. At a
 * word boundary: the last space within the cap, when that keeps at least half
 * of it; otherwise a hard cut. Listing names have no cap, so a long source
 * name must not fail the brand's save.
 */
export function capName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= BRAND_NAME_MAX) return trimmed
  let head = ''
  let next = ''
  for (const part of graphemes(trimmed)) {
    if (head.length + part.length > BRAND_NAME_MAX) {
      next = part
      break
    }
    head += part
  }
  if (next === ' ') return head.trimEnd()
  const space = head.lastIndexOf(' ')
  return (space >= BRAND_NAME_MAX / 2 ? head.slice(0, space) : head).trimEnd()
}

/**
 * A slug base short enough that the longest suffix added to it (freeSlug's
 * fallback, 9 characters, or `-<district>` up to 64) keeps it within the
 * public brand lookup's 200 (lib/brands SLUG_RE). Arabic transliteration can
 * double a name's length, so the cut is made after slugify. Trailing hyphens
 * are stripped.
 */
const SLUG_BASE_MAX = 120

function slugBase(name: string, fallback: string): string {
  const slug = slugify(name).slice(0, SLUG_BASE_MAX).replace(/-+$/, '')
  return slug || fallback
}

/** The first candidate no row of the collection holds (trashed rows included). */
async function freeSlug(
  req: TxRequest,
  collection: 'businesses' | 'brands',
  candidates: string[],
): Promise<string> {
  for (const slug of candidates) {
    const taken = await req.payload.find({
      collection,
      where: { slug: { equals: slug } },
      select: { slug: true },
      locale: DEFAULT_LOCALE,
      limit: 1,
      depth: 0,
      overrideAccess: true,
      ...(collection === 'businesses' ? { trash: true } : {}),
      req,
    })
    if (taken.docs.length === 0) return slug
  }
  return `${candidates[0]}-${hex()}${hex()}`
}

const assertLive = (req: TxRequest) => {
  if (!req.transactionID) throw new Error('The transaction was rolled back by a nested write.')
}

// The same flags as the public submission's create: no QR code is minted for
// a draft (staff get one when they set the tier and publish), and the
// translation engine is not called on a partner's request.
const CONTEXT = { skipQrGeneration: true, skipAutoTranslate: true }

// ---------------------------------------------------------------------------

export async function createBranch(args: {
  payload: Payload
  partner: BranchPartner
  input: BranchRequest
  deps?: BranchDeps
}): Promise<BranchOutcome> {
  const { payload, partner, input } = args
  const transaction =
    args.deps?.transaction ??
    (<T>(fn: (req: TxRequest) => Promise<T>) => runInTransaction(payload, fn))
  const lock = args.deps?.lock ?? advisoryLock
  const now = args.deps?.now ?? new Date()
  const report = args.deps?.report ?? reportError

  for (let attempt = 1; ; attempt++) {
    try {
      return await transaction((req) => attemptBranch({ req, partner, input, lock, now }))
    } catch (error) {
      if (error instanceof Refusal) {
        return { ok: false, code: error.code, ...REFUSALS[error.code] }
      }
      if (isAnySlugTaken(error) && attempt < MAX_ATTEMPTS) continue
      await report(error, {
        source: 'partner.branch',
        extra: { partnerId: partner.id, sourceListingId: input.sourceListingId },
      })
      return { ok: false, code: 'error', status: 500, message: COULD_NOT_SAVE }
    }
  }
}

async function attemptBranch(opts: {
  req: TxRequest
  partner: BranchPartner
  input: BranchRequest
  lock: (req: TxRequest, key: string) => Promise<void>
  now: Date
}): Promise<BranchOutcome & { ok: true }> {
  const { req, partner, input, lock, now } = opts
  const { payload } = req

  // 1. The partner's listings, as stored now (not as the session remembers).
  await lock(req, partnerLockKey(partner.id))
  const partners = await payload.find({
    collection: 'business-users',
    where: { id: { equals: partner.id } },
    select: { businesses: true },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const owned = ids((partners.docs[0] as { businesses?: unknown } | undefined)?.businesses)
  if (!owned.map(String).includes(String(input.sourceListingId))) throw new Refusal('not-found')

  // 2. The source, in every language. `find`, so a missing row is an empty
  // answer rather than an error that kills the transaction; the trash is
  // hidden, as Payload does by default.
  await lock(req, `vardenia.branches.source:${input.sourceListingId}`)
  const sources = await payload.find({
    collection: 'businesses',
    where: { id: { equals: input.sourceListingId } },
    limit: 1,
    depth: 0,
    locale: 'all',
    overrideAccess: true,
    req,
  })
  // The local API leaves the last locale on the shared request ('all' after
  // this read), so every later call below names its locale explicitly.
  const source = sources.docs[0] as unknown as SourceListing | undefined
  // Only a live, accepted listing is a source: a draft or a rejected
  // submission answers exactly as a missing one does (no existence told).
  if (!source) throw new Refusal('not-found')
  if (source._status !== 'published') throw new Refusal('not-found')
  if ((source.submission as { status?: unknown } | null | undefined)?.status === 'rejected') {
    throw new Refusal('not-found')
  }
  if (!canHaveBrand(source.subcategories)) throw new Refusal('not-restaurant')

  // 3. At most so many new branches a day. A branch is told apart by what
  // this flow writes and the others never do together: a brand from birth,
  // no magazine issue, and a submission date (submission.submittedAt). The
  // public form always sets `issue` (its schema requires it), so a
  // restaurant submitted today that just got its brand as a source is not
  // counted; a staff-made restaurant has no issue but no submission date
  // either, so it is not counted after its first branch request gave it a
  // brand. The source is not excluded by id: a branch published today and
  // used as a source is still one of today's branches. Publishing changes
  // none of the three, so a branch staff published today still counts.
  // Trashed ones count too.
  const recent = await payload.count({
    collection: 'businesses',
    where: {
      and: [
        { id: { in: owned } },
        { createdAt: { greater_than: new Date(now.getTime() - DAY_MS).toISOString() } },
        { brand: { exists: true } },
        { issue: { exists: false } },
        { 'submission.submittedAt': { exists: true } },
      ],
    },
    trash: true,
    locale: DEFAULT_LOCALE,
    overrideAccess: true,
    req,
  })
  if (recent.totalDocs >= MAX_NEW_BRANCHES_PER_DAY) throw new Refusal('daily-limit')

  // 4. The brand: the source's, or a new one named after it.
  const sourceName = capName(firstText(source.name) ?? input.name)
  let brandId = idOf(source.brand)
  let brandCreated = false
  let brandName = sourceName
  if (brandId !== null) {
    const brands = await payload.find({
      collection: 'brands',
      where: { id: { equals: brandId } },
      select: { name: true },
      limit: 1,
      depth: 0,
      locale: DEFAULT_LOCALE,
      overrideAccess: true,
      req,
    })
    brandName = firstText((brands.docs[0] as { name?: unknown } | undefined)?.name) ?? sourceName
  } else {
    const base = slugBase(sourceName, 'brand')
    const slug = await freeSlug(req, 'brands', [base, `${base}-${hex()}`, `${base}-${hex()}`])
    const brand = await payload.create({
      collection: 'brands',
      data: { name: sourceName, slug } as never,
      locale: DEFAULT_LOCALE,
      depth: 0,
      overrideAccess: true,
      req,
    })
    assertLive(req)
    brandId = brand.id as number
    brandCreated = true
    await payload.update({
      collection: 'businesses',
      id: source.id,
      data: { brand: brandId } as never,
      locale: DEFAULT_LOCALE,
      depth: 0,
      overrideAccess: true,
      context: CONTEXT,
      req,
    })
    assertLive(req)
  }

  // 5. At most so many listings per brand.
  await lock(req, `vardenia.branches.brand:${brandId}`)
  const members = await payload.count({
    collection: 'businesses',
    where: { brand: { equals: brandId } },
    locale: DEFAULT_LOCALE,
    overrideAccess: true,
    req,
  })
  if (members.totalDocs >= MAX_BRANCHES_PER_BRAND) throw new Refusal('brand-full')

  // 6. The branch: the allow-listed copy plus the new place.
  const base = slugBase(input.name, 'branch')
  const slug = await freeSlug(req, 'businesses', [
    base,
    `${base}-${input.district ?? input.governorate}`,
    `${base}-${hex()}`,
    `${base}-${hex()}`,
  ])
  const inDefault = (value: unknown) => valueIn(value, DEFAULT_LOCALE)
  const areas = areaRows(source.seatingAreas)
  const data: Record<string, unknown> = {
    name: input.name,
    slug,
    category: source.category,
    subcategories: source.subcategories,
    tagline: inDefault(source.tagline),
    description: inDefault(source.description),
    heroImage: idOf(source.heroImage),
    gallery: ids(source.gallery),
    logo: idOf(source.logo) ?? undefined,
    menu: idOf(source.menu) ?? undefined,
    amenities: Array.isArray(source.amenities) ? source.amenities : [],
    payments: copiedPayments(source.payments),
    contact: mergedContact(source.contact, input.contact),
    seatingAreas: areas.map((row) => {
      const label = inDefault(row.label)
      return {
        setting: row.setting,
        smoking: row.smoking === true,
        tables: row.tables,
        ...(label !== undefined ? { label } : {}),
      }
    }),
    governorate: input.governorate,
    district: input.district,
    address: input.address,
    mapUrl: input.mapUrl,
    location: input.location,
    openingHours: (input.openingHours ?? []).map((row) => ({
      day: row.day,
      opens: row.opens,
      closes: row.closes,
      closed: row.closed,
    })),
    brand: brandId,
    booking: { enabled: false },
    _status: 'draft',
    submission: {
      status: 'pending',
      ownerName: partner.name || partner.email,
      ownerEmail: partner.email,
      ownerPhone: partner.phone ?? undefined,
      submittedAt: now.toISOString(),
    },
  }
  for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key]

  const created = await payload.create({
    collection: 'businesses',
    data: data as never,
    locale: DEFAULT_LOCALE,
    depth: 0,
    overrideAccess: true,
    context: CONTEXT,
    req,
  })
  assertLive(req)
  const listingId = created.id as number

  // 7. The other languages of the copied prose and the area labels. Name and
  // address are proper nouns, written once in the default locale (the config
  // falls back to it), as the public submission does.
  const createdAreas = areaRows(
    (created as { seatingAreas?: unknown }).seatingAreas,
  ) as (AreaRow & {
    id?: unknown
  })[]
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue
    const update: Record<string, unknown> = {}
    const tagline = valueIn(source.tagline, locale)
    const description = valueIn(source.description, locale)
    if (tagline !== undefined) update.tagline = tagline
    if (description !== undefined) update.description = description
    const labels = areas.map((row) => valueIn(row.label, locale))
    if (labels.some((label) => label !== undefined)) {
      update.seatingAreas = createdAreas.map((row, i) => ({
        id: row.id,
        setting: row.setting,
        smoking: row.smoking,
        tables: row.tables,
        ...(labels[i] !== undefined ? { label: labels[i] } : {}),
      }))
    }
    if (Object.keys(update).length === 0) continue
    await payload.update({
      collection: 'businesses',
      id: listingId,
      data: update as never,
      locale,
      depth: 0,
      overrideAccess: true,
      context: CONTEXT,
      req,
    })
    assertLive(req)
  }

  // 8. The partner sees it at once. `businesses` is staff-only to write, so
  // this goes through the system. Re-read right before the write and append,
  // so a listing added to the account since step 1 (staff in the admin, a
  // publish in hooks/linkPartnerOnPublish, which takes the same partner
  // lock) is kept rather than overwritten by the list read at step 1.
  const latest = await payload.find({
    collection: 'business-users',
    where: { id: { equals: partner.id } },
    select: { businesses: true },
    limit: 1,
    depth: 0,
    locale: DEFAULT_LOCALE,
    overrideAccess: true,
    req,
  })
  const current = ids((latest.docs[0] as { businesses?: unknown } | undefined)?.businesses)
  const appended = current.map(String).includes(String(listingId))
    ? current
    : [...current, listingId]
  await payload.update({
    collection: 'business-users',
    id: partner.id,
    data: { businesses: appended } as never,
    locale: DEFAULT_LOCALE,
    depth: 0,
    overrideAccess: true,
    req,
  })
  assertLive(req)

  return { ok: true, listingId, brandId: brandId as number, brandCreated, brandName, sourceName }
}
