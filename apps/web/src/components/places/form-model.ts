import type { Locale } from '@vardenia/i18n'
import { fieldErrors } from '@vardenia/core/booking-request'
import { LISTING_GOVERNORATES } from '@vardenia/core/listing-numbers'
import { contactProblemCode } from '@vardenia/core/contact'
import { SUBMISSION_EMAIL_MESSAGE, placeSubmissionSchema } from '@vardenia/core/place-submission'
import { GOVERNORATES, type District } from '@vardenia/core/regions'
import { categoryOfKind } from '@vardenia/core/taxonomy'
import { categoryLabel, placeLabel } from '../../lib/labels'
import { emptyPreview, type PreviewData, type PreviewTemplate } from './preview-model'

/**
 * The "add your place" form as data: its state, what it sends, and how the
 * schema's answers map back onto its inputs. Pure, so it is tested without a
 * browser; PlaceSubmissionForm only renders it.
 *
 * The state is plain strings and booleans, NOT typed against the schema's input
 * type: zod 4 marks the preprocess-wrapped keys (publicPhone and the other
 * contact fields) as required there. The object sent is built as `unknown` and
 * checked with safeParse, which is what the server does too.
 */

export interface FormState {
  template: PreviewTemplate
  name: string
  tagline: string
  description: string
  kind: string
  governorate: string
  district: string
  address: string
  acceptsWhish: boolean
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
    kind: '',
    governorate: '',
    district: '',
    address: '',
    acceptsWhish: false,
    publicPhone: '',
    instagram: '',
    facebook: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
  }
}

export function districtsFor(governorate: string): readonly District[] {
  return (
    (GOVERNORATES as readonly { slug: string; districts: readonly District[] }[]).find(
      (g) => g.slug === governorate,
    )?.districts ?? []
  )
}

/** A new governorate drops the district, which belonged to the old one. */
export function withGovernorate(state: FormState, governorate: string): FormState {
  if (governorate === state.governorate) return state
  return { ...state, governorate, district: '' }
}

/** The object the route validates. */
export function buildSubmission(
  state: FormState,
  pick: NumberPick | null,
  locale: Locale,
): { data: unknown } {
  const data: Record<string, unknown> = {
    name: state.name,
    tagline: state.tagline,
    description: state.description,
    kind: state.kind,
    governorate: state.governorate,
    district: state.district,
    address: state.address,
    acceptsWhish: state.acceptsWhish,
    publicPhone: state.publicPhone,
    instagram: state.instagram,
    facebook: state.facebook,
    ownerName: state.ownerName,
    ownerEmail: state.ownerEmail,
    ownerPhone: state.ownerPhone,
    pageTemplate: state.template,
    locale,
  }
  if (pick) {
    data.issue = pick.issue
    data.listingNumber = pick.number
  }
  return { data }
}

/**
 * The input a schema path belongs to: issue and number both point at the
 * number picker, every other path names its input.
 */
export function formErrorKey(path: string): string {
  const [head] = path.split('.')
  if (head === 'issue' || head === 'listingNumber') return 'number'
  return head || '_'
}

/** Schema errors (path to message) keyed by input, first message kept. */
export function normaliseErrors(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, message] of Object.entries(raw)) {
    const key = formErrorKey(path)
    if (!(key in out)) out[key] = message
  }
  return out
}

export type ErrorKind = 'required' | 'tooLong' | 'email' | 'link' | 'phone' | 'invalid'

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
  return 'invalid'
}

export function checkSubmission(
  state: FormState,
  pick: NumberPick | null,
  locale: Locale,
): { ok: true; data: unknown } | { ok: false; errors: Record<string, string> } {
  const { data } = buildSubmission(state, pick, locale)
  const parsed = placeSubmissionSchema.safeParse(data)
  if (parsed.success) return { ok: true, data }
  const errors = normaliseErrors(fieldErrors(parsed.error))
  // An unchosen select fails as "not available" or an enum error; to the
  // owner it is simply not filled in yet.
  for (const key of ['kind', 'governorate', 'district'] as const) {
    if (errors[key] && !state[key]) errors[key] = 'required'
  }
  // With no region yet the district select is disabled and lists nothing: the
  // error belongs on the region, the input the owner can change.
  if (!state.governorate) delete errors.district
  return { ok: false, errors }
}

/** What the page preview shows: translated labels, never slugs. */
export function previewDataFrom(
  state: FormState,
  media: { heroUrl?: string; galleryUrls: string[]; logoUrl?: string; listingNumber?: number },
  locale: Locale,
): PreviewData {
  return {
    ...emptyPreview(locale),
    name: state.name,
    tagline: state.tagline,
    description: state.description,
    category: categoryLabel(categoryOfKind(state.kind) ?? '', locale),
    governorate: placeLabel(state.governorate, state.district, locale),
    address: state.address,
    phone: state.publicPhone.trim(),
    galleryUrls: media.galleryUrls,
    ...(media.heroUrl ? { heroUrl: media.heroUrl } : {}),
    ...(media.logoUrl ? { logoUrl: media.logoUrl } : {}),
    ...(media.listingNumber !== undefined ? { listingNumber: media.listingNumber } : {}),
  }
}
