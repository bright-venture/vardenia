import { describe, expect, it } from 'vitest'
import {
  MAX_BODY_BYTES,
  parseSubmission,
  readBody,
  statusForOutcome,
} from './place-submission-request'

const DATA = {
  name: 'Cafe Cedar',
  kind: 'cafes',
  governorate: 'beirut',
  city: 'beirut',
  address: 'Hamra',
  ownerName: 'Sami',
  ownerEmail: 'sami@example.com',
  ownerPhone: '70123456',
  pageTemplate: 'a',
  layout: 'full-page',
  issue: 1,
  listingNumber: 5,
  locale: 'en',
}

/** Like a browser: the length is stated unless the test says otherwise. */
const request = (body: unknown, headers: Record<string, string | null> = {}) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const all: Record<string, string | null> = {
    'content-type': 'application/json',
    'content-length': String(new TextEncoder().encode(text).length),
    ...headers,
  }
  return new Request('http://localhost/place-submissions', {
    method: 'POST',
    headers: Object.fromEntries(Object.entries(all).filter(([, v]) => v !== null)) as Record<
      string,
      string
    >,
    body: text,
  })
}

describe('readBody', () => {
  it('returns the JSON object', async () => {
    const r = await readBody(request({ data: DATA, turnstileToken: 't' }))
    expect(r.ok && r.body.turnstileToken).toBe('t')
  })
  it('415s on a body that is not JSON by type (multipart is gone)', async () => {
    const r = await readBody(request('x', { 'content-type': 'multipart/form-data; boundary=a' }))
    expect(!r.ok && r.status).toBe(415)
  })
  it('400s on invalid JSON, and on JSON that is not an object', async () => {
    for (const body of ['{nope', '[]', '"x"', 'null']) {
      const r = await readBody(request(body))
      expect(!r.ok && r.status).toBe(400)
    }
  })
  it('411s when the length is missing or not a number, without reading the body', async () => {
    for (const length of [null, 'abc', '-5', '']) {
      const r = await readBody(request({ data: DATA }, { 'content-length': length }))
      expect(!r.ok && r.status).toBe(411)
    }
  })
  it('caps a JSON body at 100 KB', () => {
    expect(MAX_BODY_BYTES).toBe(100_000)
  })
  it('accepts a body exactly at the cap, refuses one byte over', async () => {
    const pad = (n: number) => JSON.stringify({ x: 'x'.repeat(n - 8) })
    expect((await readBody(request(pad(MAX_BODY_BYTES)))).ok).toBe(true)
    const over = await readBody(request(pad(MAX_BODY_BYTES + 1)))
    expect(!over.ok && over.status).toBe(413)
  })
  it('413s from the actual text when the declared length is small or lies', async () => {
    const big = JSON.stringify({ x: 'x'.repeat(MAX_BODY_BYTES) })
    for (const length of ['10', '1']) {
      const r = await readBody(request(big, { 'content-length': length }))
      expect(!r.ok && r.status).toBe(413)
    }
  })
  it('measures the body in bytes: Arabic text over the cap in bytes but under it in characters', async () => {
    // 'ب' is 2 bytes in UTF-8: 60,000 of them are 120,000 bytes but 60,000 characters.
    const arabic = JSON.stringify({ x: '\u0628'.repeat(60_000) })
    expect(arabic.length).toBeLessThan(MAX_BODY_BYTES)
    const r = await readBody(request(arabic, { 'content-length': '10' }))
    expect(!r.ok && r.status).toBe(413)
    const small = await readBody(request({ x: '\u0628'.repeat(1000) }))
    expect(small.ok).toBe(true)
  })
  it('413s on a declared length over the cap, and on a body over it', async () => {
    const declared = await readBody(request({}, { 'content-length': String(MAX_BODY_BYTES + 1) }))
    expect(!declared.ok && declared.status).toBe(413)
    const actual = await readBody(request({ data: 'x'.repeat(MAX_BODY_BYTES) }))
    expect(!actual.ok && actual.status).toBe(413)
  })
})

describe('parseSubmission', () => {
  it('returns the input', () => {
    const r = parseSubmission({ data: DATA })
    expect(r.ok && r.input.name).toBe('Cafe Cedar')
  })
  it('400s with a kind field error for an unknown kind', () => {
    const r = parseSubmission({ data: { ...DATA, kind: 'spaceport' } })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(400)
      expect((r.body as { errors: Record<string, string> }).errors.kind).toBe(
        'this kind of place is not available yet',
      )
    }
  })
  it('400s with field errors when the data is invalid, or missing', () => {
    const r = parseSubmission({ data: { ...DATA, name: '' } })
    expect(!r.ok && r.status).toBe(400)
    expect(!r.ok && 'errors' in r.body).toBe(true)
    expect(parseSubmission({}).ok).toBe(false)
  })
  it('ignores smuggled fields', () => {
    const r = parseSubmission({
      data: { ...DATA, tier: 'gold', _status: 'published', payment: { status: 'paid' } },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      for (const key of ['tier', '_status', 'payment']) expect(key in r.input).toBe(false)
    }
  })
})

describe('statusForOutcome', () => {
  it('maps every refusal', () => {
    expect(statusForOutcome('number-unavailable')).toBe(409)
    expect(statusForOutcome('no-range')).toBe(422)
    expect(statusForOutcome('kind-unavailable')).toBe(400)
    expect(statusForOutcome('error')).toBe(500)
  })
})
