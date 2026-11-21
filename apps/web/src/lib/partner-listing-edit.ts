import type { PartnerEditableField } from '@vardenia/core/partner-fields'
import { CONTACT_FIELDS, type ContactField } from '@vardenia/core/contact'
import { STAY_FEATURES, type StayFeature, type StayPackageUnit } from '@vardenia/core/stay'
import type { SeatingSetting } from '@vardenia/core/seating'
import { richText } from './rich-text'

/**
 * The partner dashboard's "Listing details" form, as pure functions (Task 12a,
 * 21 November 2026).
 *
 * The form keeps strings (what the inputs hold); this turns them into the
 * body of `PATCH /api/businesses/:id`. The body carries only the top-level
 * fields that changed, each built from an explicit list of keys - never a
 * spread of the stored document - so it can only ever name fields on core
 * PARTNER_EDITABLE_FIELDS and sub-keys the listing has. The guard
 * (hooks/guardPartnerListingWrite) refuses anything else with a 400; the test
 * beside this file runs every body through that same check.
 *
 * Client-safe: imports core by file, never the package entry
 * (lib/client-imports.test.ts).
 */

export interface ListingKinds {
  /** Facilities, popular facilities, highlights (core canHaveRoomTypes). */
  hotel: boolean
  /** Stay prices, packages, features (core isWholePropertyStay). */
  getaway: boolean
  /** Seating areas (core canHaveSeatingAreas). */
  seating: boolean
}

export interface PackageRow {
  /** React's key only. Never sent. */
  key: string
  /** Payload's row id: kept so bookings that name the package still find it. */
  id: string | null
  label: string
  description: string
  price: string
  unit: StayPackageUnit
  active: boolean
}

export interface SeatingRow {
  /** React's key only. Never sent. */
  key: string
  /** Payload's row id: kept so the row, and its other languages, stay the same row. */
  id: string | null
  setting: SeatingSetting
  smoking: boolean
  tables: string
  label: string
}

export interface StayDraft {
  nightlyPrice: string
  includedGuests: string
  maxGuests: string
  extraGuestFee: string
  childrenCountAsGuests: boolean
  minNights: string
  packages: PackageRow[]
}

/** The Businesses `payments` group: how a guest can pay the venue. */
export const PAYMENT_METHODS = ['cash', 'card', 'whish', 'omt'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface ListingDraft {
  tagline: string
  /** Plain text, one paragraph per line. */
  description: string
  contact: Record<ContactField, string>
  address: string
  mapUrl: string
  /** Listing amenities (core AMENITIES), every kind of place. */
  amenities: string[]
  payments: Record<PaymentMethod, boolean>
  facilities: string[]
  popularFacilities: string[]
  propertyHighlights: string[]
  stay: StayDraft
  features: Record<StayFeature, boolean>
  seatingAreas: SeatingRow[]
}

export function emptyDraft(): ListingDraft {
  return {
    tagline: '',
    description: '',
    contact: Object.fromEntries(CONTACT_FIELDS.map((field) => [field, ''])) as Record<
      ContactField,
      string
    >,
    address: '',
    mapUrl: '',
    amenities: [],
    payments: { cash: false, card: false, whish: false, omt: false },
    facilities: [],
    popularFacilities: [],
    propertyHighlights: [],
    stay: {
      nightlyPrice: '',
      includedGuests: '',
      maxGuests: '',
      extraGuestFee: '',
      childrenCountAsGuests: true,
      minNights: '',
      packages: [],
    },
    features: Object.fromEntries(STAY_FEATURES.map((feature) => [feature, false])) as Record<
      StayFeature,
      boolean
    >,
    seatingAreas: [],
  }
}

/* ------------------------------------------------------------------------ */
/* Description: plain paragraphs only                                        */
/* ------------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The description's paragraphs, or null when it holds anything a plain
 * textarea would lose: headings, lists, quotes, links, uploads, bold or
 * italic text. A description the team formatted is then shown read-only and
 * never sent, rather than silently flattened. Empty or missing is `[]`.
 */
export function descriptionParagraphs(value: unknown): string[] | null {
  if (value === null || value === undefined) return []
  if (!isRecord(value) || !isRecord(value.root)) return null
  const children = value.root.children
  if (children === undefined) return []
  if (!Array.isArray(children)) return null
  const out: string[] = []
  for (const paragraph of children) {
    if (!isRecord(paragraph) || paragraph.type !== 'paragraph') return null
    // Alignment and indentation are formatting too.
    if (paragraph.format || paragraph.indent) return null
    const inline = paragraph.children ?? []
    if (!Array.isArray(inline)) return null
    let text = ''
    for (const node of inline) {
      if (!isRecord(node)) return null
      if (node.type === 'linebreak') text += '\n'
      else if (
        node.type === 'text' &&
        typeof node.text === 'string' &&
        !node.format &&
        !node.style
      ) {
        text += node.text
      } else return null
    }
    out.push(text)
  }
  return out
}

/** The description as the textarea shows it: one paragraph per line. */
export function descriptionText(value: unknown): string {
  return (descriptionParagraphs(value) ?? []).join('\n')
}

const lines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

/**
 * Plain text to the Lexical document the description field stores: each
 * non-empty line a paragraph (lib/rich-text), in the page's direction so an
 * Arabic description reads right to left in the admin too. Null when empty.
 */
export function textToDescription(text: string, dir: 'ltr' | 'rtl'): unknown {
  const paragraphs = lines(text)
  if (paragraphs.length === 0) return null
  const doc = richText(paragraphs)
  return {
    root: {
      ...doc.root,
      direction: dir,
      children: doc.root.children.map((p) => ({ ...p, direction: dir })),
    },
  }
}

/* ------------------------------------------------------------------------ */
/* The PATCH body                                                            */
/* ------------------------------------------------------------------------ */

/** A local problem the server never sees: a number the form could not read. */
export type DraftProblem = 'number'

const text = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Blank is null; anything that is not a finite number is reported. */
function numberAt(value: string, path: string, problems: Record<string, DraftProblem>) {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    problems[path] = 'number'
    return null
  }
  return n
}

const sorted = (values: string[]) => [...values].sort()

interface Built {
  /** What is sent. */
  value: unknown
  /** What is compared, when it differs from what is sent (order-free lists). */
  compare?: unknown
}

type Builders = Partial<Record<PartnerEditableField, (draft: ListingDraft) => Built>>

function builders(
  kinds: ListingKinds,
  options: PatchOptions,
  problems: Record<string, DraftProblem>,
): Builders {
  const out: Builders = {
    tagline: (d) => ({ value: text(d.tagline) }),
    contact: (d) => ({
      value: Object.fromEntries(CONTACT_FIELDS.map((field) => [field, text(d.contact[field])])),
    }),
    address: (d) => ({ value: text(d.address) }),
    mapUrl: (d) => ({ value: text(d.mapUrl) }),
    amenities: (d) => ({ value: [...d.amenities], compare: sorted(d.amenities) }),
    payments: (d) => ({
      value: Object.fromEntries(PAYMENT_METHODS.map((method) => [method, d.payments[method]])),
    }),
  }
  if (options.descriptionEditable) {
    out.description = (d) => ({
      value: textToDescription(d.description, options.dir),
      compare: lines(d.description),
    })
  }
  if (kinds.hotel) {
    out.facilities = (d) => ({ value: [...d.facilities], compare: sorted(d.facilities) })
    out.popularFacilities = (d) => ({
      value: [...d.popularFacilities],
      compare: sorted(d.popularFacilities),
    })
    out.propertyHighlights = (d) => ({
      value: [...d.propertyHighlights],
      compare: sorted(d.propertyHighlights),
    })
  }
  if (kinds.getaway) {
    out.stay = (d) => ({
      value: {
        nightlyPrice: numberAt(d.stay.nightlyPrice, 'stay.nightlyPrice', problems),
        includedGuests: numberAt(d.stay.includedGuests, 'stay.includedGuests', problems),
        maxGuests: numberAt(d.stay.maxGuests, 'stay.maxGuests', problems),
        extraGuestFee: numberAt(d.stay.extraGuestFee, 'stay.extraGuestFee', problems),
        childrenCountAsGuests: d.stay.childrenCountAsGuests,
        minNights: numberAt(d.stay.minNights, 'stay.minNights', problems),
        packages: d.stay.packages.map((row, index) => ({
          ...(row.id ? { id: row.id } : {}),
          label: row.label.trim(),
          description: text(row.description),
          price: numberAt(row.price, `stay.packages.${index}.price`, problems),
          unit: row.unit,
          active: row.active,
        })),
      },
    })
    out.features = (d) => ({
      value: Object.fromEntries(STAY_FEATURES.map((feature) => [feature, d.features[feature]])),
    })
  }
  if (kinds.seating) {
    out.seatingAreas = (d) => ({
      value: d.seatingAreas.map((row, index) => ({
        ...(row.id ? { id: row.id } : {}),
        setting: row.setting,
        smoking: row.smoking,
        tables: numberAt(row.tables, `seatingAreas.${index}.tables`, problems),
        label: text(row.label),
      })),
    })
  }
  return out
}

export interface PatchOptions {
  descriptionEditable: boolean
  dir: 'ltr' | 'rtl'
  /**
   * Off the default language only: the listing's name to send with every
   * change. `name` is required and localized, so a listing named only in
   * English (a new branch, say) could not be saved from the Arabic page
   * without it (the rule hooks/autoTranslateListing follows too). The page
   * passes this language's name, or the default one when it is empty.
   */
  requiredName?: string | null
}

/**
 * The body for `PATCH /api/businesses/:id`: the allow-listed fields of this
 * kind of listing whose value changed, each whole (a changed contact sends
 * every contact field, so the group is never half-written). `problems` names
 * the numbers the form could not read; when there are any, nothing is sent.
 * `location` is never sent: the server fills it from the map link.
 */
export function buildListingPatch(
  initial: ListingDraft,
  draft: ListingDraft,
  kinds: ListingKinds,
  options: PatchOptions,
): {
  body: Partial<Record<PartnerEditableField, unknown>>
  problems: Record<string, DraftProblem>
} {
  const problems: Record<string, DraftProblem> = {}
  // The saved values are read with a throwaway problem list: a number the
  // form could not read is only the draft's fault.
  const before = builders(kinds, options, {})
  const after = builders(kinds, options, problems)
  const body: Partial<Record<PartnerEditableField, unknown>> = {}
  for (const key of Object.keys(after) as PartnerEditableField[]) {
    const old = before[key]!(initial)
    const now = after[key]!(draft)
    const same =
      JSON.stringify('compare' in old ? old.compare : old.value) ===
      JSON.stringify('compare' in now ? now.compare : now.value)
    if (!same) body[key] = now.value
  }
  if (Object.keys(problems).length > 0) return { body: {}, problems }
  if (Object.keys(body).length === 0) return { body, problems }

  // Required values in other languages (see PatchOptions). Payload fills what
  // the body leaves out from the stored document in the save's own language,
  // with no fallback, then checks `required`: a value missing there fails the
  // save on a field the partner never touched. A package's name is one, so a
  // getaway with packages sends its stay group (names filled per language by
  // lib/partner-listing-read) with every change.
  if (kinds.getaway && draft.stay.packages.length > 0 && body.stay === undefined) {
    body.stay = after.stay!(draft).value
  }
  if (options.requiredName && body.name === undefined) body.name = options.requiredName
  return { body, problems }
}

/** Tick or untick a facility; unticking also drops it from the popular ones. */
export function toggleFacility(
  picks: { facilities: string[]; popularFacilities: string[] },
  slug: string,
): { facilities: string[]; popularFacilities: string[] } {
  if (picks.facilities.includes(slug)) {
    return {
      facilities: picks.facilities.filter((s) => s !== slug),
      popularFacilities: picks.popularFacilities.filter((s) => s !== slug),
    }
  }
  return { facilities: [...picks.facilities, slug], popularFacilities: picks.popularFacilities }
}

/* ------------------------------------------------------------------------ */
/* What a refused save said                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Payload's answer to a refused write, split for the form: field errors
 * (`errors[0].data.errors[{ path, message }]`, from the fields' validators:
 * a phone number, a map link outside Lebanon) by dotted path, to show beside
 * the field; and the first error's message, which for a guard refusal (an
 * unknown key, a field of another kind of listing) is the only thing said.
 * The server's sentences are shown as written, as ClosedDates does.
 */
export function readSaveErrors(json: unknown): {
  fields: Record<string, string>
  message: string | null
} {
  const fields: Record<string, string> = {}
  if (!isRecord(json) || !Array.isArray(json.errors)) return { fields, message: null }
  let message: string | null = null
  for (const error of json.errors) {
    if (!isRecord(error)) continue
    if (message === null && typeof error.message === 'string') message = error.message
    const inner = isRecord(error.data) ? error.data.errors : undefined
    if (!Array.isArray(inner)) continue
    for (const item of inner) {
      if (isRecord(item) && typeof item.path === 'string' && typeof item.message === 'string') {
        fields[item.path] ??= item.message
      }
    }
  }
  return { fields, message }
}

/**
 * After a save, the draft with the row ids Payload gave the new rows (read by
 * position from the saved document), so the next save keeps them the same
 * rows. A row whose position has no id in the answer keeps what it had.
 */
export function adoptRowIds(draft: ListingDraft, doc: unknown): ListingDraft {
  const ids = (value: unknown): (string | null)[] =>
    Array.isArray(value)
      ? value.map((row) => (isRecord(row) && typeof row.id === 'string' ? row.id : null))
      : []
  const saved = isRecord(doc) ? doc : {}
  const packageIds = ids(isRecord(saved.stay) ? saved.stay.packages : undefined)
  const areaIds = ids(saved.seatingAreas)
  return {
    ...draft,
    stay: {
      ...draft.stay,
      packages: draft.stay.packages.map((row, i) => ({ ...row, id: packageIds[i] ?? row.id })),
    },
    seatingAreas: draft.seatingAreas.map((row, i) => ({ ...row, id: areaIds[i] ?? row.id })),
  }
}

/* ------------------------------------------------------------------------ */
/* Errors with no field on the form                                          */
/* ------------------------------------------------------------------------ */

/** The paths the form shows an input or a group for, for this kind of listing. */
function placedPatterns(kinds: ListingKinds, descriptionEditable: boolean): RegExp[] {
  const out = [
    /^tagline$/,
    /^contact(\.\w+)?$/,
    /^address$/,
    /^mapUrl$/,
    /^amenities(\.\d+)?$/,
    /^payments(\.\w+)?$/,
  ]
  if (descriptionEditable) out.push(/^description$/)
  if (kinds.hotel) out.push(/^(facilities|popularFacilities|propertyHighlights)(\.\d+)?$/)
  if (kinds.getaway) {
    out.push(
      /^stay(\.(nightlyPrice|includedGuests|maxGuests|extraGuestFee|minNights|childrenCountAsGuests|packages))?$/,
      /^stay\.packages\.\d+\.(label|description|price|unit|active)$/,
      /^features(\.\w+)?$/,
    )
  }
  if (kinds.seating) out.push(/^seatingAreas(\.\d+\.(setting|smoking|tables|label))?$/)
  return out
}

/** "stay.packages.0.label" as "Stay > packages 1 > label", for a person. */
export function humanisePath(path: string): string {
  const parts: string[] = []
  for (const part of path.split('.')) {
    if (/^\d+$/.test(part) && parts.length > 0) parts[parts.length - 1] += ` ${Number(part) + 1}`
    else parts.push(part.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
  }
  const text = parts.join(' > ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Field errors split into those shown beside an input on this form and those
 * that have none here (a missing name or photo, a classification): the
 * notice must carry the second kind, or a refused save would point at
 * nothing.
 */
export function splitFieldErrors(
  fields: Record<string, string>,
  kinds: ListingKinds,
  descriptionEditable: boolean,
): {
  placed: Record<string, string>
  unplaced: { path: string; label: string; message: string }[]
} {
  const patterns = placedPatterns(kinds, descriptionEditable)
  const placed: Record<string, string> = {}
  const unplaced: { path: string; label: string; message: string }[] = []
  for (const [path, message] of Object.entries(fields)) {
    if (patterns.some((pattern) => pattern.test(path))) placed[path] = message
    else unplaced.push({ path, label: humanisePath(path), message })
  }
  return { placed, unplaced }
}
