import { describe, expect, it } from 'vitest'
import {
  MAX_SUBMISSION_BYTES,
  bodySizeProblem,
  parseSubmission,
  statusForOutcome,
} from './place-submission-request'

const png = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', { type: 'image/png' })

const DATA = {
  name: 'Cafe Cedar',
  category: 'food-and-beverage',
  subcategories: [],
  governorate: 'beirut',
  address: 'Hamra',
  amenities: [],
  payments: { cash: true, card: false, whish: false, omt: false },
  ownerName: 'Sami',
  ownerEmail: 'sami@example.com',
  ownerPhone: '70123456',
  pageTemplate: 'a',
  issue: 1,
  listingNumber: 5,
  locale: 'en',
}

const form = (data: unknown, files: Record<string, File[]> = { hero: [png()] }) => {
  const f = new FormData()
  if (data !== undefined) f.set('data', typeof data === 'string' ? data : JSON.stringify(data))
  for (const [key, list] of Object.entries(files)) for (const file of list) f.append(key, file)
  return f
}

describe('bodySizeProblem', () => {
  it('pins the cap at exactly 6 MB', () => {
    const six = 6 * 1024 * 1024
    expect(MAX_SUBMISSION_BYTES).toBe(six)
    expect(bodySizeProblem(new Headers({ 'content-length': String(six) }))).toBeNull()
    expect(bodySizeProblem(new Headers({ 'content-length': String(six + 1) }))?.status).toBe(413)
  })

  const h = (length?: string) =>
    new Headers(length === undefined ? {} : { 'content-length': length })
  it('accepts a body within the cap', () => {
    expect(bodySizeProblem(h('1000'))).toBeNull()
    expect(bodySizeProblem(h(String(MAX_SUBMISSION_BYTES)))).toBeNull()
  })
  it('refuses an oversize body with 413', () => {
    expect(bodySizeProblem(h(String(MAX_SUBMISSION_BYTES + 1)))?.status).toBe(413)
  })
  it('refuses a missing or invalid length with 411', () => {
    expect(bodySizeProblem(h())?.status).toBe(411)
    expect(bodySizeProblem(h('abc'))?.status).toBe(411)
    expect(bodySizeProblem(h('-5'))?.status).toBe(411)
  })
})

describe('parseSubmission', () => {
  it('returns the input and the files', () => {
    const r = parseSubmission(form(DATA, { hero: [png()], gallery: [png(), png()], logo: [png()] }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.input.name).toBe('Cafe Cedar')
      expect(r.files.gallery).toHaveLength(2)
      expect(r.files.logo).toBeDefined()
    }
  })
  it('treats empty gallery and logo slots as absent', () => {
    const empty = new File([], '', { type: 'application/octet-stream' })
    const r = parseSubmission(form(DATA, { hero: [png()], gallery: [empty], logo: [empty] }))
    expect(r.ok && r.files.gallery.length === 0 && r.files.logo === undefined).toBe(true)
  })
  it('400s with field errors when the data is invalid', () => {
    const r = parseSubmission(form({ ...DATA, name: '' }))
    expect(!r.ok && r.status).toBe(400)
    expect(!r.ok && 'errors' in r.body).toBe(true)
  })
  it('400s on missing or non-JSON data', () => {
    expect(parseSubmission(form(undefined)).ok).toBe(false)
    expect(parseSubmission(form('{nope')).ok).toBe(false)
  })
  it('400s without exactly one hero, and on more than six gallery photos', () => {
    expect(parseSubmission(form(DATA, {})).ok).toBe(false)
    expect(parseSubmission(form(DATA, { hero: [png(), png()] })).ok).toBe(false)
    const seven = Array.from({ length: 7 }, png)
    expect(parseSubmission(form(DATA, { hero: [png()], gallery: seven })).ok).toBe(false)
  })
  it('ignores smuggled fields', () => {
    const r = parseSubmission(form({ ...DATA, tier: 'gold', _status: 'published' }))
    expect(r.ok && 'tier' in r.input).toBe(false)
  })
  it('413s on a photo over the per-file cap', () => {
    const big = new File([new Uint8Array(1)], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 })
    const r = parseSubmission(form(DATA, { hero: [big] }))
    expect(!r.ok && r.status).toBe(413)
  })
})

describe('statusForOutcome', () => {
  it('maps every refusal', () => {
    expect(statusForOutcome('number-unavailable')).toBe(409)
    expect(statusForOutcome('no-range')).toBe(422)
    expect(statusForOutcome('invalid-files')).toBe(400)
    expect(statusForOutcome('error')).toBe(500)
  })
})
