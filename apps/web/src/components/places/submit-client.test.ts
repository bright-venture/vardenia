import { describe, expect, it, vi } from 'vitest'
import {
  buildSubmissionBody,
  postSubmission,
  SUBMISSION_URL,
  type SubmissionParts,
} from './submit-client'

const parts = (over: Partial<SubmissionParts> = {}): SubmissionParts => ({
  data: { name: 'Le Petit Jardin', listingNumber: 47 },
  turnstileToken: 'tok',
  ...over,
})

const STARTED = {
  reference: 'VD-12',
  sessionToken: 'tok123',
  uploadUrl: 'https://x.test/en/magazine-places/upload#t=tok123',
  expiresAt: '2026-11-23T10:30:00.000Z',
}

const reply = (status: number, body: unknown, type = 'application/json') =>
  vi.fn(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': type },
      }),
  )

describe('buildSubmissionBody', () => {
  it('puts the fields in data and the token beside it, and no files', () => {
    expect(JSON.parse(buildSubmissionBody(parts()))).toEqual({
      data: { name: 'Le Petit Jardin', listingNumber: 47 },
      turnstileToken: 'tok',
    })
  })

  it('sends a null token when there is none', () => {
    expect(
      JSON.parse(buildSubmissionBody(parts({ turnstileToken: null }))).turnstileToken,
    ).toBeNull()
  })
})

describe('postSubmission', () => {
  it('posts JSON to the route', async () => {
    const fetchImpl = reply(201, STARTED)
    await postSubmission(parts(), fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(SUBMISSION_URL)
    expect(SUBMISSION_URL).toBe('/place-submissions')
    expect(init.method).toBe('POST')
    expect(typeof init.body).toBe('string')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('returns the reference, token and expiry of a started submission', async () => {
    expect(await postSubmission(parts(), reply(201, STARTED))).toEqual({ kind: 'ok', ...STARTED })
  })

  it('carries the price of the chosen layout from the start answer', async () => {
    const result = await postSubmission(
      parts(),
      reply(201, { ...STARTED, price: 500, downpaymentAmount: 250, currency: 'USD' }),
    )
    expect(result).toEqual({
      kind: 'ok',
      ...STARTED,
      quote: { price: 500, downpaymentAmount: 250, currency: 'USD' },
    })
  })

  it('leaves the quote out when the start answer has no usable price', async () => {
    const result = await postSubmission(
      parts(),
      reply(201, { ...STARTED, price: 'x', downpaymentAmount: 250, currency: 'USD' }),
    )
    expect(result).toEqual({ kind: 'ok', ...STARTED })
  })

  it('treats a 201 without them as unknown', async () => {
    expect((await postSubmission(parts(), reply(201, { ok: true }))).kind).toBe('unknown')
  })

  const cases: Array<[string, number, unknown, string, object?]> = [
    [
      '400 field errors',
      400,
      { ok: false, errors: { name: 'required', listingNumber: 'required' } },
      'field-errors',
      { errors: { name: 'required', listingNumber: 'required' } },
    ],
    ['400 message', 400, { ok: false, message: 'Please add one main photo.' }, 'invalid'],
    ['403', 403, { ok: false, code: 'failed', message: 'x' }, 'turnstile'],
    ['409', 409, { ok: false, code: 'number-unavailable', message: 'x' }, 'number-taken'],
    ['411', 411, { ok: false, message: 'x' }, 'unknown'],
    ['413', 413, { ok: false, message: 'x' }, 'too-large'],
    ['422', 422, { ok: false, code: 'no-range', message: 'x' }, 'no-range'],
    ['429 plain text', 429, 'Too many requests.', 'rate-limited'],
    ['429 too many open', 429, { ok: false, code: 'too-many-open', message: 'x' }, 'too-many-open'],
    ['500', 500, { ok: false, code: 'error', message: 'x' }, 'unknown'],
    ['502 html', 502, '<html>Bad gateway</html>', 'unknown'],
  ]

  for (const [label, status, body, kind, extra] of cases) {
    it(`maps ${label} to ${kind}`, async () => {
      const type = typeof body === 'string' ? 'text/plain' : 'application/json'
      const result = await postSubmission(parts(), reply(status, body, type))
      expect(result.kind).toBe(kind)
      if (extra) expect(result).toMatchObject(extra)
    })
  }

  it('maps a thrown fetch to network', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect((await postSubmission(parts(), fetchImpl)).kind).toBe('network')
  })

  it('treats a 400 with a non-object errors field as invalid, not as field errors', async () => {
    const result = await postSubmission(parts(), reply(400, { ok: false, errors: 'nope' }))
    expect(result.kind).toBe('invalid')
  })

  it('keeps only string field errors', async () => {
    const result = await postSubmission(
      parts(),
      reply(400, { ok: false, errors: { name: 'required', bad: 3 } }),
    )
    expect(result).toEqual({ kind: 'field-errors', errors: { name: 'required' } })
  })

  it('treats a 2xx without a readable body as unknown: there is no session to carry on with', async () => {
    const result = await postSubmission(parts(), reply(200, 'not json', 'text/plain'))
    expect(result.kind).toBe('unknown')
  })
})
