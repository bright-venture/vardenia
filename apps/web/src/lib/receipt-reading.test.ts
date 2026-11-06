import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Reading a receipt: what is kept of an answer, that a reading cannot be
 * forged or moved to another photo, what the team is asked to check, and the
 * request sent to Claude (the SDK is mocked; nothing leaves the machine).
 */

const sdk = vi.hoisted(() => ({ parse: vi.fn(), options: [] as unknown[] }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { parse: sdk.parse } }
    constructor(options: unknown) {
      sdk.options.push(options)
    }
  },
}))

const { cleanReading, openReading, readReceipt, readingConcerns, receiptNumber, sealReading } =
  await import('./receipt-reading')

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const OTHER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9])
const PDF = new TextEncoder().encode('%PDF-1.7 rest')

const READ = {
  total: 84.5,
  currency: 'USD',
  date: '2026-11-03',
  place: 'yes',
  number: '004512',
} as const

describe('what is kept of a reading', () => {
  it('keeps a total only with its currency, rounded as that currency is written', () => {
    expect(cleanReading({ ...READ, total: 84.499 })).toEqual({ ...READ, total: 84.5 })
    expect(cleanReading({ ...READ, total: 2_685_000.4, currency: 'LBP' })?.total).toBe(2_685_000)
    expect(cleanReading({ ...READ, currency: null })).toMatchObject({ total: null, currency: null })
  })

  it('drops a total that is zero, negative or absurd, and a date that is not one', () => {
    expect(cleanReading({ ...READ, total: 0 })?.total).toBeNull()
    expect(cleanReading({ ...READ, total: -5 })?.total).toBeNull()
    expect(cleanReading({ ...READ, total: 5_000_000 })?.total).toBeNull()
    expect(cleanReading({ ...READ, date: '2026-02-30' })?.date).toBeNull()
    expect(cleanReading({ ...READ, date: '03/11/2026' })?.date).toBeNull()
    expect(cleanReading({ ...READ, place: 'maybe' })?.place).toBe('unclear')
  })
})

describe('the seal', () => {
  it('opens for the same booking and the same file', () => {
    const sealed = sealReading(READ, 9, JPEG)
    expect(openReading(sealed, 9, JPEG)).toEqual(READ)
  })

  it('does not open for another booking or another photo', () => {
    const sealed = sealReading(READ, 9, JPEG)
    expect(openReading(sealed, 10, JPEG)).toBeNull()
    expect(openReading(sealed, 9, OTHER)).toBeNull()
  })

  it('does not open once the reading inside is changed', () => {
    const [, mac] = sealReading(READ, 9, JPEG).split('.')
    const forged = Buffer.from(JSON.stringify({ ...READ, total: 10 })).toString('base64url')
    expect(openReading(`${forged}.${mac}`, 9, JPEG)).toBeNull()
    expect(openReading('nonsense', 9, JPEG)).toBeNull()
  })
})

describe('what the team is asked to check', () => {
  const visit = new Date('2026-11-03T18:00:00Z')
  const sent = { amount: 84.5, currency: 'USD' }

  it('nothing, when the guest sent what was read and it fits the visit', () => {
    expect(readingConcerns(READ, sent, visit)).toEqual([])
    expect(readingConcerns(READ, { amount: 84.51, currency: 'USD' }, visit)).toEqual([])
  })

  it('a total the guest changed, or sent in another currency', () => {
    expect(readingConcerns(READ, { amount: 120, currency: 'USD' }, visit)).toEqual(['amount'])
    expect(readingConcerns(READ, { amount: 84.5, currency: 'LBP' }, visit)).toEqual(['amount'])
  })

  it('a date more than a day from the visit, in Lebanon', () => {
    // 23:30 in Beirut on the 3rd is still the 3rd there, though the 3rd in UTC
    // ended; a receipt printed on the 4th, after midnight, is fine.
    const late = new Date('2026-11-03T21:30:00Z')
    expect(readingConcerns({ ...READ, date: '2026-11-04' }, sent, late)).toEqual([])
    expect(readingConcerns({ ...READ, date: '2026-10-28' }, sent, visit)).toEqual(['date'])
  })

  it('another business, or no total at all', () => {
    expect(readingConcerns({ ...READ, place: 'no' }, sent, visit)).toEqual(['place'])
    expect(readingConcerns({ ...READ, place: 'unclear' }, sent, visit)).toEqual([])
    expect(
      readingConcerns(
        { total: null, currency: null, date: null, place: 'unclear', number: null },
        sent,
        visit,
      ),
    ).toEqual(['unreadable', 'number'])
  })
})

/**
 * The receipt number is what stops one receipt being sent for two visits
 * (lib/receipts), so the same receipt has to read the same way every time.
 */
describe('the receipt number', () => {
  it('drops spacing and punctuation, and upper-cases letters', () => {
    expect(receiptNumber('#0045-12')).toBe('004512')
    expect(receiptNumber(' inv 77/a ')).toBe('INV77A')
  })

  it('reads Arabic-Indic and Persian digits as the same number', () => {
    expect(receiptNumber('٠٠٤٥')).toBe('0045')
    expect(receiptNumber('۱۲')).toBe('12')
  })

  it('keeps nothing that has no digit, is empty, or is absurdly long', () => {
    expect(receiptNumber('TOTAL')).toBeNull()
    expect(receiptNumber('  ')).toBeNull()
    expect(receiptNumber('1'.repeat(41))).toBeNull()
    expect(receiptNumber(45)).toBeNull()
  })

  it('is kept in a reading, and asked to be checked when it is missing', () => {
    expect(cleanReading({ ...READ, number: 'No. 45' })?.number).toBe('NO45')
    const visit = new Date('2026-11-03T18:00:00Z')
    const sent = { amount: 84.5, currency: 'USD' }
    expect(readingConcerns({ ...READ, number: null }, sent, visit)).toEqual(['number'])
  })
})

describe('asking Claude', () => {
  const answer = (parsed: unknown, stop = 'end_turn') => ({
    stop_reason: stop,
    parsed_output: parsed,
  })

  beforeEach(() => {
    sdk.parse.mockReset()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends the photo with the place, and keeps what comes back', async () => {
    sdk.parse.mockResolvedValue(
      answer({
        legible: true,
        total: 84.5,
        currency: 'USD',
        date: '2026-11-03',
        fromPlace: 'yes',
        number: '#0045-12',
      }),
    )
    await expect(readReceipt(JPEG, 'image/jpeg', 'Em Sherif')).resolves.toEqual(READ)

    const request = sdk.parse.mock.calls[0]![0]
    expect(request).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
      output_config: { effort: 'low' },
    })
    expect(request.messages[0].content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg' },
    })
    expect(request.messages[0].content[1].text).toContain('Em Sherif')
    // Short enough to answer inside the host's 10 second limit, and not retried.
    expect(sdk.options[0]).toMatchObject({ maxRetries: 0 })
  })

  it('sends a PDF as a document', async () => {
    sdk.parse.mockResolvedValue(
      answer({ legible: true, total: 30, currency: 'USD', date: null, fromPlace: 'unclear' }),
    )
    await readReceipt(PDF, 'application/pdf', 'Em Sherif')
    expect(sdk.parse.mock.calls[0]![0].messages[0].content[0]).toMatchObject({
      type: 'document',
      source: { media_type: 'application/pdf' },
    })
  })

  it('gives no total for an illegible receipt, and nothing for a refusal', async () => {
    sdk.parse.mockResolvedValueOnce(
      answer({ legible: false, total: 12, currency: 'USD', date: null, fromPlace: 'unclear' }),
    )
    await expect(readReceipt(JPEG, 'image/jpeg', 'X')).resolves.toMatchObject({ total: null })
    sdk.parse.mockResolvedValueOnce(answer(null, 'refusal'))
    await expect(readReceipt(JPEG, 'image/jpeg', 'X')).resolves.toBeNull()
  })

  it('is off without an API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    await expect(readReceipt(JPEG, 'image/jpeg', 'X')).resolves.toBeNull()
    expect(sdk.parse).not.toHaveBeenCalled()
  })
})
