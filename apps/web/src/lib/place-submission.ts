import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'

import { isInRange, type NumberRange, type PlaceSubmission } from '@vardenia/core'
import { DEFAULT_LOCALE } from '@vardenia/i18n'
import { heldNumbers } from '../collections/ListingRanges'
import { slugify } from '../fields/slug'
import { PHOTO_MAX_BYTES } from '../hooks/limitUploadSize'
import { uniqueViolation } from './db-errors'
import { richText } from './rich-text'
import { reportError } from './report'

/**
 * The one public door that creates a listing.
 *
 * `businesses.create` and `media.create` are staff-only. This is the only code
 * that writes them for an anonymous visitor, and it does so with
 * `overrideAccess: true` - so it is the access rule. Two consequences:
 *
 * - The listing is built from an explicit allow-list, field by field, never by
 *   spreading the input. A smuggled `tier`, `verified`, `_status`, commission or
 *   contract date cannot reach the record, because nothing here copies it.
 * - Everything checkable is checked before the first write, and the files are
 *   checked before any media exists.
 *
 * Not transactional: if the listing fails after its photos were stored, the
 * photos stay behind as orphans. Accepted for v1; staff can delete them in the
 * Media library, and there is no cleanup job. A slug clash is not such a
 * failure: the listing is retried with the same photos (see below).
 */

export type SubmissionFiles = { hero: File; gallery: File[]; logo?: File }

export type SubmissionOutcome =
  | { ok: true; listingId: number }
  | {
      ok: false
      code: 'number-unavailable' | 'no-range' | 'invalid-files' | 'error'
      message: string
    }

export const MAX_GALLERY_FILES = 6

const COULD_NOT_SAVE = 'We could not save that. Please try again.'
const NUMBER_UNAVAILABLE = 'That number is no longer available. Please choose another.'

/** JPEG, PNG and WebP only: narrower than Media, which also takes avif, mp4 and pdf. */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type AllowedType = (typeof ALLOWED_TYPES)[number]

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte)

/** What the leading bytes say the file is, whatever its name or declared type. */
function sniffType(bytes: Uint8Array): AllowedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp'
  }
  return null
}

interface CheckedFile {
  data: Buffer
  mimetype: AllowedType
  name: string
  size: number
}

/** A readable reason, or the file's bytes when it passes. */
async function checkFile(file: File | undefined, label: string): Promise<CheckedFile | string> {
  if (!file || typeof file.arrayBuffer !== 'function') return `The ${label} photo is missing.`
  if (file.size === 0) return `The ${label} photo is empty.`
  if (file.size > PHOTO_MAX_BYTES) {
    return `The ${label} photo is over ${PHOTO_MAX_BYTES / (1024 * 1024)} MB. Please choose a smaller one.`
  }
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return `The ${label} photo must be a JPEG, PNG or WebP image.`
  }
  const data = Buffer.from(await file.arrayBuffer())
  if (sniffType(data) !== file.type) {
    return `The ${label} photo must be a JPEG, PNG or WebP image.`
  }
  return { data, mimetype: file.type as AllowedType, name: file.name || 'photo', size: data.length }
}

async function checkFiles(
  files: SubmissionFiles,
): Promise<{ hero: CheckedFile; gallery: CheckedFile[]; logo?: CheckedFile } | string> {
  if (!Array.isArray(files.gallery) || files.gallery.length > MAX_GALLERY_FILES) {
    return `Please add at most ${MAX_GALLERY_FILES} gallery photos.`
  }
  const hero = await checkFile(files.hero, 'main')
  if (typeof hero === 'string') return hero
  const gallery: CheckedFile[] = []
  for (const [i, file] of files.gallery.entries()) {
    const checked = await checkFile(file, `gallery ${i + 1}`)
    if (typeof checked === 'string') return checked
    gallery.push(checked)
  }
  let logo: CheckedFile | undefined
  if (files.logo) {
    const checked = await checkFile(files.logo, 'logo')
    if (typeof checked === 'string') return checked
    logo = checked
  }
  return { hero, gallery, logo }
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

export async function createPlaceSubmission(args: {
  payload: Payload
  input: PlaceSubmission
  files: SubmissionFiles
}): Promise<SubmissionOutcome> {
  const { payload, input, files } = args

  /*
   * Photos stored so far, deleted again if the submission then fails (21
   * November 2026, authentication audit step 8). Before, a submission that lost
   * the race for its number, or failed to save, left its photos in the media
   * library with nothing using them.
   */
  const uploaded: (number | string)[] = []

  try {
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
        message: 'Listings in that area are not open for this issue yet.',
      }
    }
    if (!isInRange(input.listingNumber, range)) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }
    const held = await heldNumbers(payload, input.issue, input.governorate)
    if (held.includes(input.listingNumber)) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }

    const checked = await checkFiles(files)
    if (typeof checked === 'string') {
      return { ok: false, code: 'invalid-files', message: checked }
    }

    const upload = async (file: CheckedFile) => {
      const media = await payload.create({
        collection: 'media',
        data: { alt: input.name, usageRights: 'supplied' },
        file,
        locale: input.locale,
        overrideAccess: true,
      })
      uploaded.push(media.id)
      return media.id
    }
    const heroImage = await upload(checked.hero)
    const gallery: number[] = []
    for (const photo of checked.gallery) gallery.push(await upload(photo))
    const logo = checked.logo ? await upload(checked.logo) : undefined

    // The allow-list. Tier is left to its default; nothing commercial,
    // verified, contract, QR or staff-only is ever set here, and the slug only
    // when the automatic one clashes.
    const data = {
      name: input.name,
      tagline: input.tagline,
      description: input.description ? richText(paragraphs(input.description)) : undefined,
      category: input.category,
      subcategories: input.subcategories,
      governorate: input.governorate,
      district: input.district,
      address: input.address,
      openingHours: input.openingHours,
      priceRange: input.priceRange,
      amenities: input.amenities,
      payments: input.payments,
      heroImage,
      gallery,
      logo,
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
        status: 'pending',
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        ownerPhone: input.ownerPhone,
        pageTemplate: input.pageTemplate,
        submittedAt: new Date().toISOString(),
      },
    }

    // A slug clash is retried with the photos already stored; any other
    // failure, or the last clash, goes to the catch below.
    let listingId: number | undefined
    const attempts = slugAttempts(input.name, input.listingNumber)
    for (const [i, slug] of attempts.entries()) {
      try {
        const listing = await payload.create({
          collection: 'businesses',
          data: (slug ? { ...data, slug } : data) as never,
          // Name, tagline, description and address are localized: they are
          // saved in the language the owner wrote them in.
          locale: input.locale,
          overrideAccess: true,
          // Two afterChange hooks must not act on an anonymous create.
          // skipQrGeneration: the default tier is silver, a printed tier, so
          // ensureQrCode would otherwise mint a QR code for every public
          // submission; staff get it when they set the tier and save or publish.
          // skipAutoTranslate: an anonymous request must not call the translation
          // engine (cost, abuse), and staff review the owner's text first.
          context: { skipQrGeneration: true, skipAutoTranslate: true },
        })
        listingId = listing.id as number
        break
      } catch (error) {
        if (!isSlugTaken(error) || i === attempts.length - 1) throw error
      }
    }
    if (listingId === undefined) throw new Error('unreachable: no listing and no error')

    // Name and address are a proper noun and a street, so they are also written
    // into the default locale: otherwise staff browsing in English see a blank
    // draft they cannot identify. Tagline and description are prose and are NOT
    // copied: the auto-translate hook treats default-locale text as the English
    // source and would translate Arabic as if it were English. The draft already
    // exists, so a failure here is reported but does not fail the submission.
    if (input.locale !== DEFAULT_LOCALE) {
      try {
        await payload.update({
          collection: 'businesses',
          id: listingId,
          data: { name: input.name, address: input.address } as never,
          locale: DEFAULT_LOCALE,
          depth: 0,
          overrideAccess: true,
          context: { skipAutoTranslate: true, skipQrGeneration: true },
        })
      } catch (error) {
        await reportError(error, { source: 'place-submission.default-locale' })
      }
    }
    return { ok: true, listingId }
  } catch (error) {
    await deleteUploaded(payload, uploaded)
    // Lost the race for the number between the check above and the insert.
    if (isListingNumberTaken(error)) {
      return { ok: false, code: 'number-unavailable', message: NUMBER_UNAVAILABLE }
    }
    await reportError(error, { source: 'place-submission.create' })
    return { ok: false, code: 'error', message: COULD_NOT_SAVE }
  }
}

/**
 * Deletes the photos a failed submission stored. Through Payload, so the files
 * go too. Best effort: a photo that cannot be deleted is reported, and the
 * submission's own answer is not changed by it.
 */
async function deleteUploaded(payload: Payload, ids: readonly (number | string)[]): Promise<void> {
  for (const id of ids) {
    try {
      await payload.delete({ collection: 'media', id, overrideAccess: true })
    } catch (error) {
      await reportError(error, { source: 'place-submission.cleanup', extra: { media: id } })
    }
  }
}
