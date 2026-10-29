import { describe, expect, it, vi } from 'vitest'

const recordGuestAnswer = vi.fn(async () => 'recorded')
vi.mock('./attendance', () => ({ recordGuestAnswer }))

const { RECEIPT_MAX_BYTES, readReceiptAmount, receiptType, saveReceipt } =
  await import('./receipts')

/**
 * A guest's receipt: what is accepted, what is refused, and that one booking
 * keeps one receipt.
 */

const NOW = new Date('2026-11-05T12:00:00Z')
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PDF = new TextEncoder().encode('%PDF-1.7 rest')
const HTML = new TextEncoder().encode('<html><script>')

const booking = (over: Record<string, unknown> = {}) => ({
  id: 9,
  status: 'completed',
  end: '2026-11-03T20:00:00Z',
  guestAnswer: 'came',
  receipt: null,
  ...over,
})

function fakePayload(doc: unknown, linked = 1) {
  const calls = { creates: [] as unknown[], deletes: [] as unknown[], updates: [] as unknown[] }
  const payload = {
    findByID: vi.fn(async () => doc),
    create: vi.fn(async (args: unknown) => {
      calls.creates.push(args)
      return { id: 77 }
    }),
    update: vi.fn(async (args: unknown) => {
      calls.updates.push(args)
      return { docs: Array.from({ length: linked }, () => ({})) }
    }),
    delete: vi.fn(async (args: unknown) => {
      calls.deletes.push(args)
      return {}
    }),
  }
  return { payload: payload as never, calls }
}

const send = (doc: unknown, input: Partial<Parameters<typeof saveReceipt>[2]> = {}, linked = 1) => {
  const fake = fakePayload(doc, linked)
  const run = saveReceipt(
    fake.payload,
    9,
    { bytes: JPEG, amount: 84.5, currency: 'USD', ...input },
    NOW,
  )
  return { run, calls: fake.calls }
}

describe('what a receipt file is', () => {
  it('reads the type from the bytes, not the name', () => {
    expect(receiptType(JPEG)).toBe('image/jpeg')
    expect(receiptType(PDF)).toBe('application/pdf')
    expect(receiptType(HTML)).toBeNull()
  })

  it('accepts a total in pounds far above any total in dollars', () => {
    expect(readReceiptAmount('2,500,000', 'LBP')).toBe(2_500_000)
    expect(readReceiptAmount('2,500,000', 'USD')).toBeNull()
  })
})

describe('saving a receipt', () => {
  it('stores it, links it to the booking, and keeps it private to the booking', async () => {
    const { run, calls } = send(booking())
    await expect(run).resolves.toBe('saved')
    expect(calls.creates[0]).toMatchObject({
      collection: 'receipts',
      data: { booking: 9, amount: 84.5, currency: 'USD' },
      file: { mimetype: 'image/jpeg' },
    })
    expect(JSON.stringify(calls.updates[0])).toContain('"receipt":{"exists":false}')
  })

  it('counts a receipt from a guest who had not answered as "I came"', async () => {
    recordGuestAnswer.mockClear()
    await send(booking({ guestAnswer: null })).run
    expect(recordGuestAnswer).toHaveBeenCalledWith(expect.anything(), 9, 'came', NOW, 84.5)
  })

  it('refuses a disguised file, an empty one and one that is too large', async () => {
    await expect(send(booking(), { bytes: HTML }).run).resolves.toBe('bad-file')
    await expect(send(booking(), { bytes: null }).run).resolves.toBe('no-file')
    const big = new Uint8Array(RECEIPT_MAX_BYTES + 1)
    big.set(JPEG)
    await expect(send(booking(), { bytes: big }).run).resolves.toBe('too-big')
  })

  it('asks for the total', async () => {
    await expect(send(booking(), { amount: null }).run).resolves.toBe('no-amount')
  })

  it('keeps the first receipt of a booking', async () => {
    await expect(send(booking({ receipt: 12 })).run).resolves.toBe('already')
  })

  it('removes the second file when two arrive at once', async () => {
    const { run, calls } = send(booking(), {}, 0)
    await expect(run).resolves.toBe('already')
    expect(calls.deletes[0]).toMatchObject({ collection: 'receipts', id: 77 })
  })

  it('is closed to a guest who said they did not go, and to a missing booking', async () => {
    await expect(send(booking({ guestAnswer: 'did-not-come' })).run).resolves.toBe('closed')
    await expect(send(null).run).resolves.toBe('not-found')
  })
})
