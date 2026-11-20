import { fieldErrors, placeSubmissionSchema, type PlaceSubmission } from '@vardenia/core'
import { PHOTO_MAX_BYTES } from '../hooks/limitUploadSize'
import { MAX_GALLERY_FILES, type SubmissionFiles, type SubmissionOutcome } from './place-submission'

/**
 * Reading a place submission off the wire, as small pure functions so the route
 * handler stays thin and the rules here can be tested without a server.
 *
 * Request contract (the form sends exactly this): multipart/form-data with
 *   data           JSON string, validated with placeSubmissionSchema
 *   hero           one image file
 *   gallery        zero to six image files (repeat the field)
 *   logo           zero or one image file
 *   turnstileToken the Turnstile token, as a form field
 */

/** The whole request body, files included. The form downscales photos to fit. */
export const MAX_SUBMISSION_BYTES = 6 * 1024 * 1024

/** The JSON part is small; anything larger is not a form we produced. */
const MAX_DATA_CHARS = 100_000

export interface Refusal {
  status: number
  body: { ok: false; message: string } | { ok: false; errors: Record<string, string> }
}

const refuse = (status: number, message: string): Refusal => ({
  status,
  body: { ok: false, message },
})

/**
 * Checked before the body is read, so an oversize upload costs a header look and
 * nothing else. A multipart POST without a usable Content-Length (chunked
 * transfer, a missing or garbage header) is refused with 411 rather than read
 * unbounded: a browser form always sends the length, so only a script omits it.
 */
export function bodySizeProblem(headers: Headers): Refusal | null {
  const raw = headers.get('content-length')
  if (raw === null || !/^\d+$/.test(raw.trim())) {
    return refuse(411, 'The request must state its size.')
  }
  if (Number(raw) > MAX_SUBMISSION_BYTES) {
    return refuse(413, 'That submission is too large. Please use smaller photos.')
  }
  return null
}

/** The multipart body, or null when it is not one (or cannot be read). */
export async function readForm(request: Request): Promise<FormData | null> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('multipart/form-data')) return null
  try {
    return await request.formData()
  } catch {
    return null
  }
}

const isFile = (value: FormDataEntryValue): value is File =>
  typeof value !== 'string' && typeof value.arrayBuffer === 'function'

/** A browser sends an empty, nameless file for a file input left blank. */
const given = (files: File[]) => files.filter((file) => file.size > 0 || file.name !== '')

export type ParsedSubmission =
  { ok: true; input: PlaceSubmission; files: SubmissionFiles } | ({ ok: false } & Refusal)

export function parseSubmission(form: FormData): ParsedSubmission {
  const fail = (refusal: Refusal): ParsedSubmission => ({ ok: false, ...refusal })

  const raw = form.get('data')
  if (typeof raw !== 'string' || raw.length > MAX_DATA_CHARS) {
    return fail(refuse(400, 'The submission is incomplete.'))
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return fail(refuse(400, 'The submission is incomplete.'))
  }
  const parsed = placeSubmissionSchema.safeParse(json)
  if (!parsed.success) {
    return fail({ status: 400, body: { ok: false, errors: fieldErrors(parsed.error) } })
  }

  const files = (name: string) => form.getAll(name).filter(isFile)
  const hero = given(files('hero'))
  const gallery = given(files('gallery'))
  const logo = given(files('logo'))

  if (hero.length !== 1) return fail(refuse(400, 'Please add one main photo.'))
  if (gallery.length > MAX_GALLERY_FILES) {
    return fail(refuse(400, `Please add at most ${MAX_GALLERY_FILES} gallery photos.`))
  }
  if (logo.length > 1) return fail(refuse(400, 'Please add at most one logo.'))

  const all = [...hero, ...gallery, ...logo]
  if (all.some((file) => file.size > PHOTO_MAX_BYTES)) {
    return fail(refuse(413, 'A photo is too large. Please choose a smaller one.'))
  }

  return {
    ok: true,
    input: parsed.data,
    files: { hero: hero[0]!, gallery, ...(logo[0] ? { logo: logo[0] } : {}) },
  }
}

const STATUS_FOR = {
  'number-unavailable': 409,
  'no-range': 422,
  'invalid-files': 400,
  error: 500,
} as const

type Refused = Extract<SubmissionOutcome, { ok: false }>

export function statusForOutcome(code: Refused['code']): number {
  return STATUS_FOR[code]
}
