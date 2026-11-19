import { describe, expect, it, vi } from 'vitest'
import {
  buildSubmissionForm,
  postSubmission,
  SUBMISSION_URL,
  type SubmissionParts,
} from './submit-client'

const file = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'image/jpeg' })

const parts = (over: Partial<SubmissionParts> = {}): SubmissionParts => ({
  data: { name: 'Le Petit Jardin', listingNumber: 47 },
  hero: file('hero.jpg'),
  gallery: [file('g1.jpg'), file('g2.jpg')],
  logo: null,
  turnstileToken: 'tok',
  ...over,
})

const reply = (status: number, body: unknown, type = 'application/json') =>
  vi.fn(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': type },
      }),
  )

describe('buildSubmissionForm', () => {
  it('puts the JSON in data and the files under their field names', () => {
    const form = buildSubmissionForm(parts())
    expect(JSON.parse(form.get('data') as string)).toEqual({
      name: 'Le Petit Jardin',
      listingNumber: 47,
    })
    expect((form.get('hero') as File).name).toBe('hero.jpg')
    expect(form.getAll('gallery').map((f) => (f as File).name)).toEqual(['g1.jpg', 'g2.jpg'])
    expect(form.has('logo')).toBe(false)
    expect(form.get('turnstileToken')).toBe('tok')
  })

  it('adds the logo when given, and leaves out a missing token', () => {
    const form = buildSubmissionForm(parts({ logo: file('logo.png'), turnstileToken: null }))
    expect((form.get('logo') as File).name).toBe('logo.png')
    expect(form.has('turnstileToken')).toBe(false)
  })
})

describe('postSubmission', () => {
  it('posts multipart to the route', async () => {
    const fetchImpl = reply(201, { ok: true })
    await postSubmission(parts(), fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(SUBMISSION_URL)
    expect(SUBMISSION_URL).toBe('/place-submissions')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    // The browser sets the multipart boundary itself; a manual header breaks it.
    expect(init.headers).toBeUndefined()
  })

  const cases: Array<[string, number, unknown, string, object?]> = [
    ['201', 201, { ok: true }, 'ok'],
    [
      '400 field errors',
      400,
      { ok: false, errors: { name: 'required', 'openingHours.0.opens': 'use 24-hour time' } },
      'field-errors',
      { errors: { name: 'required', 'openingHours.0.opens': 'use 24-hour time' } },
    ],
    ['400 invalid files', 400, { ok: false, code: 'invalid-files', message: 'x' }, 'photos'],
    ['400 message', 400, { ok: false, message: 'Please add one main photo.' }, 'invalid'],
    ['403', 403, { ok: false, code: 'failed', message: 'x' }, 'turnstile'],
    ['409', 409, { ok: false, code: 'number-unavailable', message: 'x' }, 'number-taken'],
    ['411', 411, { ok: false, message: 'x' }, 'unknown'],
    ['413', 413, { ok: false, message: 'x' }, 'too-large'],
    ['422', 422, { ok: false, code: 'no-range', message: 'x' }, 'no-range'],
    ['429 plain text', 429, 'Too many requests.', 'rate-limited'],
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

  it('treats any 2xx as saved, even without a readable body', async () => {
    const result = await postSubmission(parts(), reply(200, 'not json', 'text/plain'))
    expect(result.kind).toBe('ok')
  })
})
