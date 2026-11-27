import type { Locale } from '@vardenia/i18n'
import { fieldErrors } from '@vardenia/core/booking-request'
import { contactProblemCode } from '@vardenia/core/contact'
import type { PageLayout } from '@vardenia/core/page-layouts'
import { SUBMISSION_EMAIL_MESSAGE, placeSubmissionSchema } from '@vardenia/core/place-submission'
import type { OpenIssue } from './use-place-issues'

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
  /** How much of the magazine is bought; null until chosen. Decides the price and the slots offered. */
  layout: PageLayout | null
  /**
   * The magazine issue, chosen first (27 November 2026); null until chosen.
   * Its coverage decides the place asked next: a governorate (All Lebanon,
   * no city) or a city of the issue's own governorate.
   */
  issue: OpenIssue | null
  name: string
  tagline: string
  description: string
  kind: string
  governorate: string
  city: string
  address: string
  acceptsWhish: boolean
  acceptsCash: boolean
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

export function initialFormState(): FormState {
  return {
    layout: null,
    issue: null,
    name: '',
    tagline: '',
    description: '',
    kind: '',
    governorate: '',
    city: '',
    address: '',
    acceptsWhish: false,
    acceptsCash: false,
    publicPhone: '',
    instagram: '',
    facebook: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
  }
}

/**
 * A new issue: its place is chosen again (an issue for one governorate fixes
 * the governorate to its own), and the layout goes with it, since the sizes on
 * sale and their prices are the issue's.
 */
export function withIssue(state: FormState, issue: OpenIssue | null): FormState {
  if (issue?.issueId === state.issue?.issueId) return state
  return {
    ...state,
    issue,
    governorate: issue?.coverage === 'governorate' ? (issue.governorate ?? '') : '',
    city: '',
    layout: null,
  }
}

/**
 * A new place of the issue (a governorate of an All Lebanon issue, or a city
 * of an issue for one governorate) has its own block: the layout goes.
 */
export function withPlace(state: FormState, place: string): FormState {
  if (state.issue?.coverage === 'governorate') {
    if (place === state.city) return state
    return { ...state, city: place, layout: null }
  }
  if (place === state.governorate) return state
  return { ...state, governorate: place, city: '', layout: null }
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
    // Only an issue for one governorate asks for the city.
    ...(state.issue?.coverage === 'governorate' && state.city ? { city: state.city } : {}),
    address: state.address,
    acceptsWhish: state.acceptsWhish,
    acceptsCash: state.acceptsCash,
    publicPhone: state.publicPhone,
    instagram: state.instagram,
    facebook: state.facebook,
    ownerName: state.ownerName,
    ownerEmail: state.ownerEmail,
    ownerPhone: state.ownerPhone,
    locale,
  }
  if (state.layout) data.layout = state.layout
  if (pick) {
    data.issue = pick.issue
    data.listingNumber = pick.number
  }
  // The issue chosen first is the one that counts.
  if (state.issue) data.issue = state.issue.issueId
  return { data }
}

/**
 * The input a schema path belongs to: the number points at the number
 * picker, every other path (the issue included) names its input.
 */
export function formErrorKey(path: string): string {
  const [head] = path.split('.')
  if (head === 'listingNumber') return 'number'
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
  const errors = parsed.success ? {} : normaliseErrors(fieldErrors(parsed.error))
  // An unchosen select fails as "not available" or an enum error; to the
  // owner it is simply not filled in yet.
  for (const key of ['kind', 'governorate', 'city', 'layout'] as const) {
    if (errors[key] && !state[key]) errors[key] = 'required'
  }
  // The place depends on the issue, which the schema cannot see: with no
  // issue nothing else is asked; an All Lebanon issue asks the governorate
  // and never the city; an issue for one governorate fixes the governorate
  // and asks the city.
  if (!state.issue) {
    errors.issue = 'required'
    delete errors.governorate
    delete errors.city
  } else if (state.issue.coverage === 'governorate') {
    delete errors.governorate
    if (!state.city) errors.city = 'required'
  } else {
    delete errors.city
    if (!state.governorate) errors.governorate = 'required'
  }
  if (Object.keys(errors).length === 0) return { ok: true, data }
  return { ok: false, errors }
}
