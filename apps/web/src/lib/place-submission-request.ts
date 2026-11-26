import { fieldErrors, placeSubmissionSchema, type PlaceSubmission } from '@vardenia/core'
import type { SubmissionOutcome } from './place-submission'

/**
 * Reading a place submission off the wire, as small pure functions so the route
 * handler stays thin and the rules here can be tested without a server.
 *
 * Request contract (the form sends exactly this): application/json with
 *   data           the fields, validated with placeSubmissionSchema
 *   turnstileToken the Turnstile token
 * No files: the logo and main photo come later, from the phone upload session.
 */

/** The JSON is small; anything larger is not a form we produced. */
export const MAX_BODY_BYTES = 100_000

export interface Refusal {
  status: number
  body: { ok: false; message: string } | { ok: false; errors: Record<string, string> }
}

const refuse = (status: number, message: string): Refusal => ({
  status,
  body: { ok: false, message },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The JSON body, or a refusal. The declared size is checked first (411 when it is
 * missing, 413 when over the cap), and the text is checked again after reading,
 * since a script can lie about the header.
 */
export async function readBody(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | ({ ok: false } & Refusal)> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    return { ok: false, ...refuse(415, 'Expected a JSON submission.') }
  }
  // The size is checked before the body is read. A browser always sends the
  // length, so a missing or garbage one is a script: 411, not read unbounded.
  const declared = request.headers.get('content-length')
  if (declared === null || !/^\d+$/.test(declared.trim())) {
    return { ok: false, ...refuse(411, 'The request must state its size.') }
  }
  if (Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, ...refuse(413, 'That submission is too large.') }
  }
  let text: string
  try {
    text = await request.text()
  } catch {
    return { ok: false, ...refuse(400, 'The submission is incomplete.') }
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, ...refuse(413, 'That submission is too large.') }
  }
  try {
    const json: unknown = JSON.parse(text)
    if (isRecord(json)) return { ok: true, body: json }
  } catch {
    // falls through to the refusal below
  }
  return { ok: false, ...refuse(400, 'The submission is incomplete.') }
}

export type ParsedSubmission = { ok: true; input: PlaceSubmission } | ({ ok: false } & Refusal)

export function parseSubmission(body: Record<string, unknown>): ParsedSubmission {
  const parsed = placeSubmissionSchema.safeParse(body.data)
  if (!parsed.success) {
    return { ok: false, status: 400, body: { ok: false, errors: fieldErrors(parsed.error) } }
  }
  return { ok: true, input: parsed.data }
}

const STATUS_FOR = {
  'number-unavailable': 409,
  'layout-unavailable': 409,
  'no-range': 422,
  'kind-unavailable': 400,
  'too-many-open': 429,
  error: 500,
} as const

type Refused = Extract<SubmissionOutcome, { ok: false }>

export function statusForOutcome(code: Refused['code']): number {
  return STATUS_FOR[code]
}
