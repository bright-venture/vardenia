import { createHash, randomBytes } from 'node:crypto'
import type { Payload } from 'payload'

import {
  categoryOfKind,
  isInRange,
  isOffered,
  isSubmittableKind,
  coverageOf,
  GOVERNORATES,
  LISTING_GOVERNORATES,
  layoutSlots,
  placeInIssue,
  placeRanges,
  rangeForPlace,
  slotLastPage,
  type IssueCoverage,
  type IssueCoverageFields,
  type NumberRange,
  type PageLayout,
  type PlaceSubmission,
  type PriceRow,
  type Slot,
} from '@vardenia/core'
import { DEFAULT_LOCALE } from '@vardenia/i18n'
import { toPriceRows, toSlots } from '../collections/Issues'
import { heldNumbers } from '../collections/ListingRanges'
import { slugify } from '../fields/slug'
import { runInTransaction } from './branches'
import { advisoryLock } from './partner-lock'
import { downpaymentFor } from './place-payment-rules'
import { hardCapFrom } from './place-session'
import { uniqueViolation } from './db-errors'
import { getPlaceSettings } from './place-settings'
import { richText } from './rich-text'
import { reportError } from './report'
import { formatSubmissionReference } from './submission-reference'

/**
 * The one public door that creates a listing: step 1 ("Next") of the Magazine
 * Places form.
 *
 * `businesses.create` is staff-only. This is the only code that writes it for
 * an anonymous visitor, and it does so with `overrideAccess: true` - so it is
 * the access rule. Two consequences:
 *
 * - The listing is built from an explicit allow-list, field by field, never by
 *   spreading the input. A smuggled `tier`, `verified`, `_status`, payment,
 *   commission or contract date cannot reach the record, because nothing here
 *   copies it.
 * - Everything checkable is checked before the first write.
 *
 * What a start makes: ONE hidden draft business (submission.status
 * `incomplete`, so it is neither public nor pending staff work), with its
 * listing number held, its reference (VD-<id>) and the phone upload session
 * whose token the owner scans from the QR code. No photos and no emails: the
 * photos arrive from the phone, and the emails go out when the owner finishes.
 *
 * The business, its reference and the session are written in ONE transaction,
 * so a failure at any point (a rival taking the number, a clash on the slug,
 * a database error) leaves nothing behind: no draft without a session, no
 * session without a draft.
 */

/**
 * `expiresAt` is the ABSOLUTE end of the upload session (start + 24 hours,
 * lib/place-session), the latest the QR link can work; it is not the idle
 * time-out, which is shorter (Settings holdMinutes) and moves with activity.
 */
export type SubmissionOutcome =
  | {
      ok: true
      listingId: number
      reference: string
      sessionToken: string
      expiresAt: string
      /** The layout's price as snapshotted on the draft, and its downpayment. */
      price: number
      downpaymentAmount: number
      currency: string
    }
  | {
      ok: false
      code:
        | 'number-unavailable'
        | 'layout-unavailable'
        | 'no-range'
        | 'kind-unavailable'
        | 'too-many-open'
        | 'error'
      message: string
    }

/**
 * How many unfinished forms (submission.status `incomplete`) one owner email may
 * hold at once. Each holds a listing number, so without a cap anyone could pin
 * a whole range for as long as they keep starting. Checked inside the start's
 * transaction under a per-email advisory lock, so two starts at once cannot
 * both slip under it.
 */
export const MAX_OPEN_STARTS_PER_EMAIL = 3

const COULD_NOT_SAVE = 'We could not save that. Please try again.'
const LAYOUT_UNAVAILABLE = 'That layout is not available. Please choose another.'
const NUMBER_UNAVAILABLE = 'That number is no longer available. Please choose another.'

/** The SHA-256 of a session token, as hex: the only form of it that is stored. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Plain text to paragraphs: a blank line starts a new one. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

interface RangeRow {
  governorate: string
  city?: string | null
  from: number
  to: number
}

/** A free slot, as the form shows it ("Page 62, position 3"; "Pages 62-63" for a spread). */
export interface FreeSlot {
  number: number
  page: number
  position: number | null
  lastPage: number
}

export interface LayoutNumbers {
  layout: PageLayout
  price: number
  downpaymentAmount: number
  /** The free slots of this layout inside the block, in number order. */
  slots: FreeSlot[]
  free: number
}

/** An issue the public form offers: one that has at least one block of numbers. */
export interface OpenIssue {
  issueId: number
  title: string
  coverage: IssueCoverage
  /** The governorate of an issue that covers one; null for All Lebanon. */
  governorate: string | null
}

/**
 * A place the owner can choose in an issue: a governorate (All Lebanon) or a
 * city of the issue's governorate (one governorate), and how many slots are
 * free in its block. `free` 0 is a full block: the form lists it, not choosable.
 */
export interface IssuePlace {
  governorate: string
  city: string | null
  free: number
}

/** The issue fields the public form needs. Slots and prices never leave the server. */
interface IssueRead {
  found: boolean
  title: string
  slots: Slot[]
  prices: PriceRow[]
  coverage: IssueCoverageFields
}

/**
 * An issue's title, slots, price table and coverage, read fresh from the issue.
 * All but the title are staff-read fields, hence overrideAccess. A legacy issue
 * (no template) has no slots, and so offers no layout. The coverage decides
 * which of the issue's blocks serves a business (core rangeForPlace). A missing
 * issue reads as `found: false`, with nothing in it.
 */
async function issueLayouts(payload: Payload, issueId: number): Promise<IssueRead> {
  const issue = (await payload.findByID({
    collection: 'issues',
    id: issueId,
    depth: 0,
    select: { title: true, slots: true, layouts: true, coverage: true, governorate: true },
    overrideAccess: true,
    disableErrors: true,
  } as never)) as {
    title?: unknown
    slots?: unknown
    layouts?: unknown
    coverage?: unknown
    governorate?: unknown
  } | null
  return {
    found: Boolean(issue),
    title: typeof issue?.title === 'string' ? issue.title : '',
    slots: toSlots(issue?.slots),
    prices: toPriceRows(issue?.layouts),
    coverage: { coverage: issue?.coverage, governorate: issue?.governorate },
  }
}

/** The price of a layout when it is on sale in the issue, else null. */
function offeredPrice(prices: readonly PriceRow[], slots: readonly Slot[], layout: unknown) {
  const row = prices.find((r) => r.layout === layout)
  return row && isOffered(row, slots) ? (row.price as number) : null
}

/**
 * Per layout on sale in the issue (offered, priced, with slots), its price and
 * the FREE slots it has inside the block. A layout with slots in the block that
 * are all held is still listed, with `free: 0`, so the form can say it is sold
 * out; one with no slot in the block at all is not offered there and is left
 * out. The one rule for both the number picker and the free counts of the
 * place choice, so a place is never choosable with nothing to pick in it.
 */
function blockLayouts(
  issue: Pick<IssueRead, 'slots' | 'prices'>,
  block: { from: number; to: number },
  held: ReadonlySet<number>,
  downpaymentPercent: number,
): LayoutNumbers[] {
  const layouts: LayoutNumbers[] = []
  for (const priceRow of issue.prices) {
    const price = offeredPrice(issue.prices, issue.slots, priceRow.layout)
    if (price === null) continue
    const inBlock = layoutSlots(issue.slots, priceRow.layout, block)
    if (inBlock.length === 0) continue
    const free = inBlock
      .filter((slot) => !held.has(slot.number))
      .sort((a, b) => a.number - b.number)
      .map((slot) => ({
        number: slot.number,
        page: slot.page,
        position: slot.position,
        lastPage: slotLastPage(slot),
      }))
    layouts.push({
      layout: priceRow.layout,
      price,
      downpaymentAmount: downpaymentFor(price, downpaymentPercent),
      slots: free,
      free: free.length,
    })
  }
  return layouts
}

const idOf = (value: unknown): number | null => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' && Number.isInteger(id) ? id : null
}

/**
 * The issues the public form offers, newest first: every issue with at least
 * one block the form can use (core placeRanges): a governorate-wide block on an
 * All Lebanon issue, or a city block of its own governorate on an issue for
 * one governorate. Only the id, title (in `locale`), coverage and the
 * governorate of a one-governorate issue: never its slots or prices.
 */
export async function openIssues(payload: Payload, locale?: string): Promise<OpenIssue[]> {
  const ranges = await payload.find({
    collection: 'listing-ranges',
    select: { issue: true, governorate: true, city: true } as never,
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const byIssue = new Map<number, RangeRow[]>()
  for (const row of ranges.docs as unknown as (RangeRow & { issue?: unknown })[]) {
    const id = idOf(row.issue)
    if (id !== null) byIssue.set(id, [...(byIssue.get(id) ?? []), row])
  }
  if (byIssue.size === 0) return []
  const issues = await payload.find({
    collection: 'issues',
    where: { id: { in: [...byIssue.keys()] } },
    select: { title: true, coverage: true, governorate: true } as never,
    sort: '-publishedAt',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    ...(locale ? { locale: locale as never } : {}),
  })
  const docs = issues.docs as unknown as {
    id: number
    title?: unknown
    coverage?: unknown
    governorate?: unknown
  }[]
  return docs.flatMap((doc): OpenIssue[] => {
    const coverage = { coverage: doc.coverage, governorate: doc.governorate }
    if (placeRanges(byIssue.get(doc.id) ?? [], coverage).length === 0) return []
    const kind = coverageOf(doc.coverage)
    return [
      {
        issueId: doc.id,
        title: typeof doc.title === 'string' ? doc.title : '',
        coverage: kind,
        governorate:
          kind === 'governorate' && typeof doc.governorate === 'string' ? doc.governorate : null,
      },
    ]
  })
}

/** Where a place sorts: governorates in the admin's order, cities in core regions' order. */
function placeOrder(place: { governorate: string; city: string | null }): [number, number] {
  const g = (LISTING_GOVERNORATES as readonly string[]).indexOf(place.governorate)
  const cities = GOVERNORATES.find((gov) => gov.slug === place.governorate)?.cities ?? []
  const c = place.city ? cities.findIndex((city) => city.slug === place.city) : -1
  return [g, c]
}

/**
 * The places an issue offers, each with how many slots its block has free:
 * the governorates with a block (All Lebanon) or the cities with a block
 * (one governorate). The free count follows the number picker's rule
 * (blockLayouts): a slot of a layout on sale, inside the block, not held. A
 * block with none free is still listed, with `free: 0` ("Full").
 *
 * The holders are read in one query for the whole issue and matched to each
 * block in memory, as heldNumbers would (governorate, and city for a city
 * block). Only numbers come back, never who holds them.
 */
export async function issuePlaces(payload: Payload, issueId: number): Promise<IssuePlace[]> {
  const issue = await issueLayouts(payload, issueId)
  if (!issue.found) return []
  const found = await payload.find({
    collection: 'listing-ranges',
    where: { issue: { equals: issueId } },
    select: { governorate: true, city: true, from: true, to: true } as never,
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const blocks = placeRanges(found.docs as unknown as RangeRow[], issue.coverage)
  if (blocks.length === 0) return []
  const holders = await payload.find({
    collection: 'businesses',
    where: {
      and: [{ issue: { equals: issueId } }, { listingNumber: { exists: true } }],
    } as never,
    select: { governorate: true, city: true, listingNumber: true } as never,
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const held = holders.docs as unknown as {
    governorate?: string | null
    city?: string | null
    listingNumber?: number | null
  }[]
  const settings = await getPlaceSettings(payload)
  const places = blocks.map((block) => {
    const city = block.city || null
    const taken = new Set(
      held
        .filter((h) => h.governorate === block.governorate && (!city || h.city === city))
        .map((h) => h.listingNumber)
        .filter((n): n is number => typeof n === 'number'),
    )
    const layouts = blockLayouts(issue, block, taken, settings.downpaymentPercent)
    return {
      governorate: block.governorate,
      city,
      free: layouts.reduce((sum, layout) => sum + layout.free, 0),
    }
  })
  return places.sort((a, b) => {
    const [ga, ca] = placeOrder(a)
    const [gb, cb] = placeOrder(b)
    return ga - gb || ca - cb
  })
}

/** What the number picker gets for one issue and place. */
export interface IssueNumbers {
  issueId: number
  issueTitle: string
  coverage: IssueCoverage
  from: number
  to: number
  taken: number[]
  /** The Settings currency the layout prices are in, for the form to show them. */
  currency: string
  layouts: LayoutNumbers[]
}

/**
 * The block of one issue that serves the place, which of its numbers are
 * taken, and per layout on sale its price and free slots (blockLayouts). A
 * number is taken when a listing that is not in the trash holds it (Payload
 * hides trashed documents from `find`). Never says who holds one.
 *
 * The place is read as the issue decides it (core placeInIssue): an All
 * Lebanon issue takes the governorate and ignores any city; an issue for one
 * governorate takes its own governorate and needs one of its cities. Empty
 * when the place does not fit the issue or has no block in it; otherwise one
 * entry, an array so the form reads it as before.
 */
export async function listNumbersFor(
  payload: Payload,
  issueId: number,
  place: { governorate?: string | null; city?: string | null },
): Promise<IssueNumbers[]> {
  const issue = await issueLayouts(payload, issueId)
  if (!issue.found) return []
  const resolved = placeInIssue(issue.coverage, place)
  if (!resolved) return []
  const ranges = await payload.find({
    collection: 'listing-ranges',
    where: {
      and: [{ issue: { equals: issueId } }, { governorate: { equals: resolved.governorate } }],
    },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const row = rangeForPlace(ranges.docs as unknown as RangeRow[], issue.coverage, resolved)
  if (!row) return []
  const taken = await heldNumbers(payload, issueId, {
    governorate: resolved.governorate,
    city: row.city,
  })
  const settings = await getPlaceSettings(payload)
  return [
    {
      issueId,
      issueTitle: issue.title,
      coverage: coverageOf(issue.coverage.coverage),
      from: row.from,
      to: row.to,
      taken,
      currency: settings.currency,
      layouts: blockLayouts(issue, row, new Set(taken), settings.downpaymentPercent),
    },
  ]
}

/**
 * A refusal of the (issue, listing_number) unique index, however it arrived.
 *
 * Payload rethrows the driver's 23505 as a ValidationError. The index is one
 * Payload did not make for a field, so the entry path is the columns read from
 * the error detail, "issue_id, listing_number". The raw driver error names the
 * index itself, `issue_listingNumber_idx` (migration 20261119_131549).
 */
export function isListingNumberTaken(error: unknown): boolean {
  const named = uniqueViolation(error)
  if (named === 'issue_id, listing_number' || named === 'issue_listingNumber_idx') return true
  return isListingNumberFieldRefusal(error)
}

/**
 * The number field's own validation (validListingNumber) refusing the number.
 * When a rival's insert commits between this request's pre-check and the
 * field validation inside create, the loser is refused here, as a
 * ValidationError on the `listingNumber` path (no table name, unlike the
 * database's refusal), not at the unique index. Same outcome for the owner.
 */
function isListingNumberFieldRefusal(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const value = current as {
      name?: unknown
      data?: { errors?: { path?: unknown }[] }
      cause?: unknown
    }
    if (value.name === 'ValidationError' && Array.isArray(value.data?.errors)) {
      return value.data.errors.some((entry) => entry?.path === 'listingNumber')
    }
    current = value.cause
  }
  return false
}

/**
 * A refusal of the unique slug index. Payload maps its index,
 * `businesses_slug_idx` (baseline migration), back to the field path `slug`;
 * the raw driver error names the index.
 */
export function isSlugTaken(error: unknown): boolean {
  const named = uniqueViolation(error)
  return named === 'slug' || named === 'businesses_slug_idx'
}

/**
 * The slugs to try for a new listing, in order. First none: the collection
 * makes one from the name, as for any listing, so most submissions get the
 * plain slug. Only on a clash (a second "Cafe Nour", or two Arabic names that
 * transliterate alike) does a suffix appear: the listing number, then the
 * number and four random hex characters, twice. Slugs are permanent once
 * published; staff can still change this one while it is a draft.
 */
function slugAttempts(name: string, listingNumber: number): (string | undefined)[] {
  const base = `${slugify(name) || 'place'}-${listingNumber}`
  const random = () => `${base}-${randomBytes(2).toString('hex')}`
  return [undefined, base, random(), random()]
}

/**
 * What the write right after the create sends: the reference, and name and
 * address for the default locale when the owner wrote in another one. Nothing
 * else, in particular not the owner's details or the status: the update-time
 * hooks of businesses (hooks/startUpdateShape.test.ts checks each) read those
 * from the stored draft, which is incomplete, so none of them refuses, frees
 * the number or publishes.
 */
export function followUpData(input: PlaceSubmission, reference: string) {
  return {
    ...(input.locale === DEFAULT_LOCALE ? {} : { name: input.name, address: input.address }),
    submission: { reference },
  }
}

/**
 * Starts a submission. The plain session token is in the result exactly once;
 * only its hash is stored. Never log or report the result.
 */
export async function startPlaceSubmission(args: {
  payload: Payload
  input: PlaceSubmission
}): Promise<SubmissionOutcome> {
  const { payload, input } = args

  try {
    // The schema refuses a hidden kind too; the service does not rely on it.
    if (!isSubmittableKind(input.kind)) {
      return {
        ok: false,
        code: 'kind-unavailable',
        message: 'That kind of place is not available yet.',
      }
    }

    // The form checks all of this too; the server does not trust that. The
    // issue decides the place (core placeInIssue): an issue for one
    // governorate takes its own governorate, never the browser's, and needs
    // one of its cities; an All Lebanon issue takes the governorate and drops
    // any city. A missing issue, a place that does not fit it, and a place
    // with no block in it are all 'no-range'.
    const issue = await issueLayouts(payload, input.issue)
    const place = issue.found ? placeInIssue(issue.coverage, input) : null
    const found = place
      ? await payload.find({
          collection: 'listing-ranges',
          where: {
            and: [
              { issue: { equals: input.issue } },
              { governorate: { equals: place.governorate } },
            ],
          },
          limit: 0,
          pagination: false,
          depth: 0,
          overrideAccess: true,
        })
      : null
    const range = place
      ? rangeForPlace((found?.docs ?? []) as unknown as NumberRange[], issue.coverage, place)
      : null
    if (!place || !range) {
      return {
        ok: false,
        code: 'no-range',
        message: 'Listings in that region are not open for this issue yet.',
      }
    }
    // The layout must be on sale in this issue, and the number one of its
    // slots inside the place's block. Slots and price are read here, from the
    // issue as it is now, never from the browser or an earlier answer. The
    // layout is checked before the number, so a layout that is not on sale is
    // refused as such whatever number came with it (LP-ST2).
    const { slots, prices } = issue
    const layoutPrice = offeredPrice(prices, slots, input.layout)
    if (layoutPrice === null) {
      return { ok: false, code: 'layout-unavailable', message: LAYOUT_UNAVAILABLE }
    }
    if (!isInRange(input.listingNumber, range)) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }
    const isSlot = layoutSlots(slots, input.layout, range).some(
      (slot) => slot.number === input.listingNumber,
    )
    if (!isSlot) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }
    const held = await heldNumbers(payload, input.issue, {
      governorate: place.governorate,
      city: range.city,
    })
    if (held.includes(input.listingNumber)) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }

    const settings = await getPlaceSettings(payload)
    // The price snapshot: what this layout costs in this issue NOW, stored on
    // the draft (submission.payment.price / downpaymentAmount). The finish step
    // copies it into the terms and payment records instead of reading Settings,
    // so a later price change in the admin cannot change what this owner was
    // shown. Drafts made before layouts have none and fall back to Settings.
    const price = layoutPrice
    const downpaymentAmount = downpaymentFor(price, settings.downpaymentPercent)
    const sessionToken = randomBytes(32).toString('base64url')
    // The absolute end of the session (see lib/place-session): what the browser
    // is shown as expiresAt. The idle time-out (holdMinutes) is separate and
    // moves with activity.
    const expiresAt = hardCapFrom(new Date())

    // The allow-list. Tier is left to its default (silver); nothing
    // commercial, verified, contract, payment, QR or staff-only is ever set
    // here, and the slug only when the automatic one clashes. submittedAt is
    // set when the owner finishes, not now.
    const data = {
      name: input.name,
      tagline: input.tagline,
      description: input.description ? richText(paragraphs(input.description)) : undefined,
      category: categoryOfKind(input.kind),
      subcategories: [input.kind],
      // As the issue decided them: no city for an All Lebanon listing.
      governorate: place.governorate,
      city: place.city ?? undefined,
      address: input.address,
      payments: { cash: false, card: false, whish: input.acceptsWhish, omt: false },
      issue: input.issue,
      listingNumber: input.listingNumber,
      // Written once, here; hooks/guardPageLayout refuses any later change.
      pageLayout: input.layout,
      _status: 'draft',
      // Public contact: shown on the listing page. Only these three come from
      // the form; the owner adds the rest later in the partner area.
      contact: {
        phone: input.publicPhone,
        instagram: input.instagram,
        facebook: input.facebook,
      },
      submission: {
        status: 'incomplete',
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        ownerPhone: input.ownerPhone,
        pageTemplate: input.pageTemplate,
        payment: { price, downpaymentAmount },
      },
    }

    // A slug clash aborts the whole transaction (Payload ends the one it is
    // given when a write fails), so each attempt is a transaction of its own.
    // Any other failure, or the last clash, goes to the catch below.
    const attempts = slugAttempts(input.name, input.listingNumber)
    for (const [i, slug] of attempts.entries()) {
      try {
        const started = await runInTransaction(payload, async (req) => {
          // One lock per owner email, then count: exact, not just race-tolerant.
          await advisoryLock(req, `vardenia.place-start-email:${input.ownerEmail}`)
          const open = await payload.find({
            collection: 'businesses',
            where: {
              and: [
                { 'submission.ownerEmail': { equals: input.ownerEmail } },
                { 'submission.status': { equals: 'incomplete' } },
              ],
            },
            limit: 1,
            depth: 0,
            req,
            overrideAccess: true,
          })
          if ((open.totalDocs ?? 0) >= MAX_OPEN_STARTS_PER_EMAIL) return null
          const listing = await payload.create({
            collection: 'businesses',
            data: (slug ? { ...data, slug } : data) as never,
            // Name, tagline, description and address are localized: they are
            // saved in the language the owner wrote them in.
            locale: input.locale,
            req,
            overrideAccess: true,
            // Two afterChange hooks must not act on an anonymous create.
            // skipQrGeneration: the default tier is silver, a printed tier, so
            // ensureQrCode would otherwise mint a QR code for every public
            // submission; staff get it when they set the tier and save or
            // publish. skipAutoTranslate: an anonymous request must not call
            // the translation engine (cost, abuse), and staff review the
            // owner's text first.
            context: { skipQrGeneration: true, skipAutoTranslate: true },
          })
          const id = listing.id as number

          // The reference is made from the record id, which is unique and
          // handed out by the database, so no counter is needed and two
          // starts at once can never share one. Written in the same
          // transaction, and the column is unique as a backstop.
          const reference = formatSubmissionReference(id)
          // Name and address are a proper noun and a street, so they are also
          // written into the default locale: otherwise staff browsing in
          // English see a blank draft they cannot identify. Tagline and
          // description are prose and are NOT copied: the auto-translate hook
          // treats default-locale text as the English source and would
          // translate Arabic as if it were English. The same write carries
          // the reference (see followUpData for why that is safe). A failure here
          // fails the whole start: inside a transaction it cannot be swallowed.
          await payload.update({
            collection: 'businesses',
            id,
            data: followUpData(input, reference) as never,
            locale: DEFAULT_LOCALE,
            depth: 0,
            req,
            overrideAccess: true,
            context: { skipAutoTranslate: true, skipQrGeneration: true },
          })

          await payload.create({
            collection: 'place-upload-sessions',
            data: {
              tokenHash: hashSessionToken(sessionToken),
              business: id,
              expiresAt,
              logoReceived: false,
              heroReceived: false,
            },
            req,
            overrideAccess: true,
          })
          return { listingId: id, reference }
        })
        if (!started) {
          return {
            ok: false,
            code: 'too-many-open',
            message:
              'You already have unfinished forms open. Please finish or wait for them to expire.',
          }
        }
        const { listingId, reference } = started
        return {
          ok: true,
          listingId,
          reference,
          sessionToken,
          expiresAt,
          price,
          downpaymentAmount,
          currency: settings.currency,
        }
      } catch (error) {
        if (!isSlugTaken(error) || i === attempts.length - 1) throw error
      }
    }
    throw new Error('unreachable: no listing and no error')
  } catch (error) {
    // Lost the race for the number between the check above and the insert.
    if (isListingNumberTaken(error)) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }
    await reportError(error, { source: 'place-submission.create' })
    return { ok: false, code: 'error', message: COULD_NOT_SAVE }
  }
}
