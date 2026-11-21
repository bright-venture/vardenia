import type { Locale } from '@vardenia/i18n'
import { fieldErrors } from '@vardenia/core/booking-request'
import { LISTING_GOVERNORATES } from '@vardenia/core/listing-numbers'
import { contactProblemCode } from '@vardenia/core/contact'
import {
  HOTEL_AND_GETAWAY_MESSAGE,
  SUBMISSION_EMAIL_MESSAGE,
  SUBMISSION_TIME_MESSAGE,
  placeSubmissionSchema,
} from '@vardenia/core/place-submission'
import { GOVERNORATES, type District } from '@vardenia/core/regions'
import { CATEGORIES, type SubCategory } from '@vardenia/core/taxonomy'
import { DAY_ORDER, type DayKey } from '../../lib/hours'
import { amenityLabel, categoryLabel, placeLabel } from '../../lib/labels'
import { emptyPreview, type PreviewData, type PreviewTemplate } from './preview-model'

/**
 * The "add your place" form as data: its state, what it sends, and how the
 * schema's answers map back onto its inputs. Pure, so it is tested without a
 * browser; PlaceSubmissionForm only renders it.
 *
 * The state is plain strings and booleans, NOT typed against the schema's input
 * type: zod 4 marks the preprocess-wrapped keys (area, publicPhone, priceRange,
 * opens, closes) as required there. The object sent is built as `unknown` and
 * checked with safeParse, which is what the server does too.
 *
 * `area` is not asked: it is an id from the Areas collection, and staff set it.
 */

export interface HoursRow {
  day: DayKey
  opens: string
  closes: string
  closed: boolean
}

export const PAYMENT_KEYS = ['cash', 'card', 'whish', 'omt'] as const
export type PaymentKey = (typeof PAYMENT_KEYS)[number]

export interface FormState {
  template: PreviewTemplate
  name: string
  tagline: string
  description: string
  category: string
  subcategories: string[]
  governorate: string
  district: string
  address: string
  hours: HoursRow[]
  priceRange: string
  amenities: string[]
  payments: Record<PaymentKey, boolean>
  publicPhone: string
  instagram: string
  facebook: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
}

/** The listing number the owner picked, with the issue it belongs to. */
export interface NumberPick {
  issue: number
  number: number
}

/** The order the form lists them in (the admin's order). */
export const GOVERNORATE_ORDER: readonly string[] = LISTING_GOVERNORATES

export function initialFormState(): FormState {
  return {
    template: 'a',
    name: '',
    tagline: '',
    description: '',
    category: '',
    subcategories: [],
    governorate: '',
    district: '',
    address: '',
    hours: DAY_ORDER.map((day) => ({ day, opens: '', closes: '', closed: false })),
    priceRange: '',
    amenities: [],
    payments: { cash: false, card: false, whish: false, omt: false },
    publicPhone: '',
    instagram: '',
    facebook: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
  }
}

export function subcategoriesFor(category: string): readonly SubCategory[] {
  return CATEGORIES.find((c) => c.slug === category)?.children.filter((c) => !c.retired) ?? []
}

export function districtsFor(governorate: string): readonly District[] {
  return (
    (GOVERNORATES as readonly { slug: string; districts: readonly District[] }[]).find(
      (g) => g.slug === governorate,
    )?.districts ?? []
  )
}

/** A new category drops the subcategories that belonged to the old one. */
export function withCategory(state: FormState, category: string): FormState {
  if (category === state.category) return state
  return { ...state, category, subcategories: [] }
}

/** A new governorate drops the district, which belonged to the old one. */
export function withGovernorate(state: FormState, governorate: string): FormState {
  if (governorate === state.governorate) return state
  return { ...state, governorate, district: '' }
}

export function toggle(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

const isBlankRow = (row: HoursRow) => !row.closed && !row.opens.trim() && !row.closes.trim()

/**
 * The object the route validates, and the day each sent hours row came from
 * (blank rows are dropped, so row 0 is not always Monday).
 */
export function buildSubmission(
  state: FormState,
  pick: NumberPick | null,
  locale: Locale,
): { data: unknown; hourDays: DayKey[] } {
  const rows = state.hours.filter((row) => !isBlankRow(row))
  const data: Record<string, unknown> = {
    name: state.name,
    tagline: state.tagline,
    description: state.description,
    category: state.category,
    subcategories: state.subcategories,
    governorate: state.governorate,
    district: state.district,
    address: state.address,
    priceRange: state.priceRange,
    amenities: state.amenities,
    payments: { ...state.payments },
    publicPhone: state.publicPhone,
    instagram: state.instagram,
    facebook: state.facebook,
    ownerName: state.ownerName,
    ownerEmail: state.ownerEmail,
    ownerPhone: state.ownerPhone,
    pageTemplate: state.template,
    locale,
  }
  if (rows.length > 0) {
    data.openingHours = rows.map((row) => ({
      day: row.day,
      opens: row.closed ? '' : row.opens,
      closes: row.closed ? '' : row.closes,
      closed: row.closed,
    }))
  }
  if (pick) {
    data.issue = pick.issue
    data.listingNumber = pick.number
  }
  return { data, hourDays: rows.map((row) => row.day) }
}

/**
 * The input a schema path belongs to. Hours rows are named by day, every part
 * of a list or group points at the group, and issue and number both point at
 * the number picker.
 */
export function formErrorKey(path: string, hourDays: readonly DayKey[]): string {
  const [head, index, field] = path.split('.')
  if (head === 'openingHours') {
    const day = index === undefined ? undefined : hourDays[Number(index)]
    return day && field ? `hours.${day}.${field}` : 'hours'
  }
  if (head === 'issue' || head === 'listingNumber') return 'number'
  return head || '_'
}

/** Schema errors (path to message) keyed by input, first message kept. */
export function normaliseErrors(
  raw: Record<string, string>,
  hourDays: readonly DayKey[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, message] of Object.entries(raw)) {
    const key = formErrorKey(path, hourDays)
    if (!(key in out)) out[key] = message
  }
  return out
}

export type ErrorKind =
  'required' | 'tooLong' | 'email' | 'link' | 'phone' | 'time' | 'hotelAndGetaway' | 'invalid'

/**
 * Which translated sentence a schema message stands for. The schema's own words
 * are English and never shown; anything unrecognised is "check this". Every
 * match is exact: a contact message is read back to its code by core contact
 * (contactProblemCode), the others are the schema's exported messages. The
 * message is what both the local check and the server's field errors carry.
 */
export function errorKind(message: string): ErrorKind {
  if (message === 'required') return 'required'
  if (message === 'too long') return 'tooLong'
  const contact = contactProblemCode(message)
  if (contact) return contact
  if (message === SUBMISSION_EMAIL_MESSAGE) return 'email'
  if (message === SUBMISSION_TIME_MESSAGE) return 'time'
  if (message === HOTEL_AND_GETAWAY_MESSAGE) return 'hotelAndGetaway'
  return 'invalid'
}

export function checkSubmission(
  state: FormState,
  pick: NumberPick | null,
  locale: Locale,
):
  | { ok: true; data: unknown; hourDays: DayKey[] }
  | { ok: false; errors: Record<string, string>; hourDays: DayKey[] } {
  const { data, hourDays } = buildSubmission(state, pick, locale)
  const parsed = placeSubmissionSchema.safeParse(data)
  if (parsed.success) return { ok: true, data, hourDays }
  const errors = normaliseErrors(fieldErrors(parsed.error), hourDays)
  // An unchosen select fails as "unknown category" or an enum error; to the
  // owner it is simply not filled in yet.
  for (const key of ['category', 'governorate'] as const) {
    if (errors[key] && !state[key]) errors[key] = 'required'
  }
  return { ok: false, errors, hourDays }
}

/**
 * One line for the page: consecutive days with the same times are grouped,
 * "Monday-Wednesday 09:00-17:00, Saturday 10:00-14:00". Closed and blank days
 * are left out (the page has one line for hours).
 */
export function hoursSummary(rows: readonly HoursRow[], dayName: (day: DayKey) => string): string {
  const groups: Array<{ first: DayKey; last: DayKey; times: string }> = []
  let previous: DayKey | null = null
  for (const row of rows) {
    const opens = row.opens.trim()
    const closes = row.closes.trim()
    if (row.closed || !opens || !closes) {
      previous = null
      continue
    }
    const times = `${opens}-${closes}`
    const group = groups.at(-1)
    if (group && previous === group.last && group.times === times) group.last = row.day
    else groups.push({ first: row.day, last: row.day, times })
    previous = row.day
  }
  return groups
    .map(({ first, last, times }) =>
      first === last ? `${dayName(first)} ${times}` : `${dayName(first)}-${dayName(last)} ${times}`,
    )
    .join(' \u00b7 ')
}

/** What the page preview shows: translated labels, never slugs. */
export function previewDataFrom(
  state: FormState,
  media: { heroUrl?: string; galleryUrls: string[]; logoUrl?: string; listingNumber?: number },
  locale: Locale,
  dayName: (day: DayKey) => string,
): PreviewData {
  return {
    ...emptyPreview(locale),
    name: state.name,
    tagline: state.tagline,
    description: state.description,
    category: categoryLabel(state.category, locale),
    governorate: placeLabel(state.governorate, state.district, locale),
    address: state.address,
    hours: hoursSummary(state.hours, dayName),
    phone: state.publicPhone.trim(),
    amenities: state.amenities.map((slug) => amenityLabel(slug, locale)),
    galleryUrls: media.galleryUrls,
    ...(media.heroUrl ? { heroUrl: media.heroUrl } : {}),
    ...(media.logoUrl ? { logoUrl: media.logoUrl } : {}),
    ...(media.listingNumber !== undefined ? { listingNumber: media.listingNumber } : {}),
  }
}
