/**
 * Sending a place submission, and reading what came back.
 *
 * Pure apart from the `fetch` it is handed, so every answer the route can give
 * is tested with a fake one. The route's contract is in
 * lib/place-submission-request.ts and app/place-submissions/route.ts.
 *
 * Every outcome is mapped to a kind the form turns into a sentence in the page's
 * language. Server text is never passed on: it is English, and some of it (a
 * 429 from the rate limiter, a gateway error page) is not even JSON.
 */

export const SUBMISSION_URL = '/place-submissions'

export interface SubmissionParts {
  /** The object checked by placeSubmissionSchema; sent as the `data` JSON string. */
  data: unknown
  hero: File
  gallery: File[]
  logo: File | null
  turnstileToken: string | null
}

export type SubmitResult =
  | { kind: 'ok' }
  | { kind: 'field-errors'; errors: Record<string, string> }
  | { kind: 'number-taken' }
  | { kind: 'no-range' }
  | { kind: 'too-large' }
  | { kind: 'rate-limited' }
  | { kind: 'turnstile' }
  | { kind: 'photos' }
  | { kind: 'invalid' }
  | { kind: 'network' }
  | { kind: 'unknown' }

export type SubmitKind = SubmitResult['kind']

export function buildSubmissionForm(parts: SubmissionParts): FormData {
  const form = new FormData()
  form.append('data', JSON.stringify(parts.data))
  form.append('hero', parts.hero, parts.hero.name)
  for (const photo of parts.gallery) form.append('gallery', photo, photo.name)
  if (parts.logo) form.append('logo', parts.logo, parts.logo.name)
  if (parts.turnstileToken) form.append('turnstileToken', parts.turnstileToken)
  return form
}

/** The body as JSON when it is JSON, otherwise null. Never throws. */
async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = JSON.parse(await response.text())
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function stringErrors(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, string> = {}
  for (const [key, message] of Object.entries(value)) {
    if (typeof message === 'string') out[key] = message
  }
  return Object.keys(out).length > 0 ? out : null
}

export async function postSubmission(
  parts: SubmissionParts,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  let response: Response
  try {
    // No content-type header: the browser writes the multipart boundary, and
    // the Content-Length the route requires, itself.
    response = await fetchImpl(SUBMISSION_URL, {
      method: 'POST',
      body: buildSubmissionForm(parts),
      credentials: 'same-origin',
    })
  } catch {
    return { kind: 'network' }
  }

  if (response.ok) return { kind: 'ok' }

  switch (response.status) {
    case 400: {
      const body = await readJson(response)
      const errors = stringErrors(body?.errors)
      if (errors) return { kind: 'field-errors', errors }
      if (body?.code === 'invalid-files') return { kind: 'photos' }
      return { kind: 'invalid' }
    }
    case 403:
      return { kind: 'turnstile' }
    case 409:
      return { kind: 'number-taken' }
    case 413:
      return { kind: 'too-large' }
    case 422:
      return { kind: 'no-range' }
    case 429:
      return { kind: 'rate-limited' }
    default:
      return { kind: 'unknown' }
  }
}
