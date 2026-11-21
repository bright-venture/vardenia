import { CONTACT_FIELDS, contactProblemCode, type ContactField } from '@vardenia/core/contact'
import { OUTSIDE_LEBANON_LINK } from '@vardenia/core/maps-link'

/**
 * The partner dashboard's "Add a branch" form, as pure functions (Task 12a,
 * 21 November 2026).
 *
 * Builds the body of `POST /partner-data/branches` (core branchRequestSchema,
 * which is strict: an unknown key is refused) and reads its answer. Blank
 * optional fields are left out rather than sent empty. Opening hours are not
 * asked for: the schema does not require them, and the team completes the
 * listing when it reviews the branch.
 *
 * Client-safe: core by file only. core/brand itself is not imported here,
 * because it brings Zod with it; the limits come from the server page.
 */

export interface BranchDraft {
  sourceListingId: string
  name: string
  governorate: string
  district: string
  address: string
  mapUrl: string
  contact: Record<ContactField, string>
}

export function emptyBranchDraft(sourceListingId: number | null): BranchDraft {
  return {
    sourceListingId: sourceListingId === null ? '' : String(sourceListingId),
    name: '',
    governorate: '',
    district: '',
    address: '',
    mapUrl: '',
    contact: Object.fromEntries(CONTACT_FIELDS.map((field) => [field, ''])) as Record<
      ContactField,
      string
    >,
  }
}

export function buildBranchBody(draft: BranchDraft, locale: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sourceListingId: Number(draft.sourceListingId),
    name: draft.name.trim(),
    governorate: draft.governorate,
  }
  if (draft.district.trim()) body.district = draft.district.trim()
  body.address = draft.address.trim()
  if (draft.mapUrl.trim()) body.mapUrl = draft.mapUrl.trim()
  const contact: Record<string, string> = {}
  for (const field of CONTACT_FIELDS) {
    const value = draft.contact[field].trim()
    if (value) contact[field] = value
  }
  if (Object.keys(contact).length > 0) body.contact = contact
  body.locale = locale
  return body
}

export type BranchResult =
  | { ok: true }
  | {
      ok: false
      /** The server's code, `too-many` for the rate limiter, `error` otherwise. */
      code: string
      message: string | null
      /** Schema issues by dotted path (`mapUrl`, `contact.phone`). */
      fields: Record<string, string>
    }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The route's answer: 201 on success; otherwise `{ code, message, issues? }`
 * as JSON (400 invalid, 404 not-found, 409 brand-full, 429 daily-limit), or
 * the rate limiter's plain-text 429, which arrives here as `null`.
 */
export function readBranchResponse(status: number, json: unknown): BranchResult {
  if (status === 201 || (status >= 200 && status < 300)) return { ok: true }
  if (!isRecord(json)) {
    return { ok: false, code: status === 429 ? 'too-many' : 'error', message: null, fields: {} }
  }
  const fields: Record<string, string> = {}
  if (Array.isArray(json.issues)) {
    for (const issue of json.issues) {
      if (isRecord(issue) && typeof issue.path === 'string' && typeof issue.message === 'string') {
        fields[issue.path] ??= issue.message
      }
    }
  }
  return {
    ok: false,
    code: typeof json.code === 'string' ? json.code : 'error',
    message: typeof json.message === 'string' ? json.message : null,
    fields,
  }
}

/**
 * The partnerBranches message key for one refusal, so the form speaks the
 * reader's language rather than the schema's English. By path, then by the
 * schema's own words (core brand, place-submission, contact, maps-link); a
 * message nobody mapped is `errInvalid`, never shown raw.
 */
export function branchIssueKey(path: string, message: string): string {
  if (path === 'name' || path === 'address') {
    if (message === 'required') return 'errRequired'
    if (message === 'too long') return 'errTooLong'
    return 'errInvalid'
  }
  if (path === 'governorate') return 'errGovernorate'
  if (path === 'district') return 'errDistrict'
  if (path === 'location') return 'errMapOutside'
  if (path === 'mapUrl') {
    if (message === OUTSIDE_LEBANON_LINK) return 'errMapOutside'
    if (message.startsWith('paste a Google Maps link or give')) return 'errMapRequired'
    return 'errMapLink'
  }
  if (path.startsWith('contact.')) {
    const code = contactProblemCode(message)
    if (code === 'phone') return 'errPhone'
    if (code === 'email') return 'errEmail'
    if (code === 'link') return 'errLink'
  }
  return 'errInvalid'
}

/** The required fields, checked before sending: path to message key. */
export function validateBranchDraft(draft: BranchDraft): Record<string, string> {
  const out: Record<string, string> = {}
  if (!draft.name.trim()) out.name = 'errRequired'
  if (!draft.governorate) out.governorate = 'errGovernorate'
  if (!draft.address.trim()) out.address = 'errRequired'
  if (!draft.mapUrl.trim()) out.mapUrl = 'errMapRequired'
  return out
}
