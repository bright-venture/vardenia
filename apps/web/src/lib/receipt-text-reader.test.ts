import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseAmount, pdfLines, readReceiptText } from './receipt-text-reader'

/**
 * The free receipt reader (RECEIPT_READER=text). The three PDFs are real text
 * PDFs, printed from a browser: a dollar bill, a French invoice with both
 * currencies, and an Arabic one in Lebanese pounds, whose text a PDF stores
 * letter by letter in visual order.
 */
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./__fixtures__/receipts/${name}.pdf`, import.meta.url))),
  )

describe('reading a PDF receipt', () => {
  it('reads the dollar bill: the total, not the subtotal, and the receipt number', async () => {
    expect(readReceiptText(await pdfLines(fixture('receipt-usd')), 'Em Sherif')).toEqual({
      total: 80.85,
      currency: 'USD',
      date: '2026-11-16',
      place: 'yes',
      number: '004512',
    })
  })

  it('takes the dollar total when the pounds total is printed too', async () => {
    const reading = readReceiptText(await pdfLines(fixture('receipt-fr-both')), 'Em Sherif')
    expect(reading).toMatchObject({ total: 145, currency: 'USD', date: '2026-11-16' })
    expect(reading.number).toBe('f-2026-0391')
  })

  it('reads the Arabic receipt in pounds', async () => {
    expect(readReceiptText(await pdfLines(fixture('receipt-ar-lbp')), 'Em Sherif')).toEqual({
      total: 1350000,
      currency: 'LBP',
      date: '2026-11-16',
      place: 'yes',
      number: '7781',
    })
  })

  it('says unclear rather than no when the booking name is not printed', async () => {
    const reading = readReceiptText(await pdfLines(fixture('receipt-usd')), 'Hotel Albergo')
    expect(reading.place).toBe('unclear')
  })
})

describe('amounts as receipts print them', () => {
  it.each([
    ['80.85', 80.85],
    ['145,00', 145],
    ['1,350,000', 1350000],
    ['12.977.500', 12977500],
    ['1.234,50', 1234.5],
    ['1,234.50', 1234.5],
  ])('%s is %s', (raw, value) => {
    expect(parseAmount(raw)).toBe(value)
  })
})

describe('lines without a usable total', () => {
  it('reads no total from a line that only has a percentage', () => {
    expect(readReceiptText(['Total service 10%'], 'X').total).toBeNull()
  })

  it('leaves the total out when no currency is printed anywhere', () => {
    expect(readReceiptText(['TOTAL 42.00'], 'X')).toMatchObject({ total: null, currency: null })
  })
})

describe('which reader runs', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
    vi.resetModules()
  })

  it('uses the free reader on a PDF when RECEIPT_READER=text and there is no key', async () => {
    process.env.ANTHROPIC_API_KEY = ''
    process.env.RECEIPT_READER = 'text'
    const { readReceipt, readerConfigured } = await import('./receipt-reading')
    expect(readerConfigured()).toBe(true)
    expect(await readReceipt(fixture('receipt-usd'), 'application/pdf', 'Em Sherif')).toMatchObject(
      { total: 80.85, currency: 'USD', number: '004512' },
    )
  })

  it('reads nothing from a photo with the free reader: the guest types', async () => {
    process.env.ANTHROPIC_API_KEY = ''
    process.env.RECEIPT_READER = 'text'
    const { readReceipt } = await import('./receipt-reading')
    expect(await readReceipt(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg', 'X')).toBeNull()
  })

  it('stays off with neither a key nor RECEIPT_READER', async () => {
    process.env.ANTHROPIC_API_KEY = ''
    delete process.env.RECEIPT_READER
    const { readerConfigured } = await import('./receipt-reading')
    expect(readerConfigured()).toBe(false)
  })
})
