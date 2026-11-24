import { createHash, randomBytes } from 'node:crypto'
import type { Payload } from 'payload'

import {
  categoryOfKind,
  isInRange,
  isSubmittableKind,
  type NumberRange,
  type PlaceSubmission,
} from '@vardenia/core'
import { DEFAULT_LOCALE } from '@vardenia/i18n'
import { heldNumbers } from '../collections/ListingRanges'
import { slugify } from '../fields/slug'
import { runInTransaction } from './branches'
import { advisoryLock } from './partner-lock'
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
  | { ok: true; listingId: number; reference: string; sessionToken: string; expiresAt: string }
  | {
      ok: false
      code: 'number-unavailable' | 'no-range' | 'kind-unavailable' | 'too-many-open' | 'error'
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
  issue: { id: number; title?: string } | number
  from: number
  to: number
}

/**
 * Each issue that has a block of numbers for this governorate, and which of
 * them are taken. A number is taken when a listing that is not in the trash
 * holds it (Payload hides trashed documents from `find`). Never says who holds
 * one: only the numbers come back.
 */
export async function listNumbersFor(
  payload: Payload,
  governorate: string,
): Promise<
  Array<{ issueId: number; issueTitle: string; from: number; to: number; taken: number[] }>
> {
  const ranges = await payload.find({
    collection: 'listing-ranges',
    where: { governorate: { equals: governorate } },
    sort: '-issue',
    limit: 0,
    pagination: false,
    depth: 1,
    overrideAccess: true,
  })
  const rows = ranges.docs as unknown as RangeRow[]
  return Promise.all(
    rows.map(async (row) => {
      const issueId = typeof row.issue === 'object' ? row.issue.id : row.issue
      const issueTitle = typeof row.issue === 'object' ? (row.issue.title ?? '') : ''
      const taken = await heldNumbers(payload, issueId, governorate)
      return { issueId, issueTitle, from: row.from, to: row.to, taken }
    }),
  )
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

    // The form checks all of this too; the server does not trust that. A
    // missing issue has no range, so it lands here as well.
    const found = await payload.find({
      collection: 'listing-ranges',
      where: {
        and: [{ issue: { equals: input.issue } }, { governorate: { equals: input.governorate } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const range = found.docs[0] as unknown as NumberRange | undefined
    if (!range) {
      return {
        ok: false,
        code: 'no-range',
        message: 'Listings in that region are not open for this issue yet.',
      }
    }
    if (!isInRange(input.listingNumber, range)) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }
    const held = await heldNumbers(payload, input.issue, input.governorate)
    if (held.includes(input.listingNumber)) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }

    const settings = await getPlaceSettings(payload)
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
      governorate: input.governorate,
      district: input.district,
      address: input.address,
      payments: { cash: false, card: false, whish: input.acceptsWhish, omt: false },
      issue: input.issue,
      listingNumber: input.listingNumber,
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
        return { ok: true, listingId, reference, sessionToken, expiresAt }
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
