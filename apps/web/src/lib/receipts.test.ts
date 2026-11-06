import { describe, expect, it, vi } from 'vitest'

const recordGuestAnswer = vi.fn(async () => 'recorded')
vi.mock('./attendance', () => ({ recordGuestAnswer }))

const { RECEIPT_MAX_BYTES, readReceiptAmount, receiptType, saveReceipt } =
  await import('./receipts')
const { sealReading } = await import('./receipt-reading')

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
  start: '2026-11-03T18:00:00Z',
  end: '2026-11-03T20:00:00Z',
  guestAnswer: 'came',
  receipt: null,
  ...over,
})

function fakePayload(doc: unknown, linked = 1, earlier: unknown[] = []) {
  const calls = {
    creates: [] as unknown[],
    deletes: [] as unknown[],
    updates: [] as unknown[],
    finds: [] as unknown[],
  }
  const payload = {
    findByID: vi.fn(async () => doc),
    // The receipts already sent with the same number at the same place.
    find: vi.fn(async (args: unknown) => {
      calls.finds.push(args)
      return { docs: earlier }
    }),
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

const send = (
  doc: unknown,
  input: Partial<Parameters<typeof saveReceipt>[2]> = {},
  linked = 1,
  earlier: unknown[] = [],
) => {
  const fake = fakePayload(doc, linked, earlier)
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

  it('keeps what was read from the photo, with what the team should check', async () => {
    const read = {
      total: 84.5,
      currency: 'USD',
      date: '2026-11-03',
      place: 'yes',
      number: '004512',
    } as const
    const reading = sealReading(read, 9, JPEG)
    const same = send(booking(), { reading })
    await same.run
    expect(same.calls.creates[0]).toMatchObject({ data: { reading: { ...read, concerns: [] } } })

    const changed = send(booking(), { reading, amount: 120 })
    await changed.run
    expect(changed.calls.creates[0]).toMatchObject({ data: { reading: { concerns: ['amount'] } } })
  })

  it('ignores a reading sealed for another photo or booking, and still saves', async () => {
    const reading = sealReading(
      { total: 9, currency: 'USD', date: null, place: 'yes', number: '1' },
      10,
      JPEG,
    )
    const { run, calls } = send(booking(), { reading })
    await expect(run).resolves.toBe('saved')
    expect((calls.creates[0] as { data: { reading?: unknown } }).data.reading).toBeUndefined()
  })

  /**
   * One receipt counts once (asked for on 6 November 2026): the same receipt
   * number at the same place is refused, before anything is recorded. Tills
   * that restart their numbering daily are allowed for by the printed date.
   */
  describe('a receipt sent twice', () => {
    const read = {
      total: 84.5,
      currency: 'USD',
      date: '2026-11-03',
      place: 'yes',
      number: '004512',
    } as const
    const reading = sealReading(read, 9, JPEG)
    const atPlace = booking({ business: 5 })

    it('is refused when the same number was sent at the same place', async () => {
      // A guest who had not answered: a refused receipt must not count as "I came".
      recordGuestAnswer.mockClear()
      const unanswered = booking({ business: 5, guestAnswer: null })
      const { run, calls } = send(unanswered, { reading }, 1, [{ reading: { date: '2026-11-03' } }])
      await expect(run).resolves.toBe('duplicate')
      expect(calls.creates).toHaveLength(0)
      expect(recordGuestAnswer).not.toHaveBeenCalled()
      expect(calls.finds[0]).toMatchObject({
        collection: 'receipts',
        where: {
          and: [{ 'reading.number': { equals: '004512' } }, { 'booking.business': { equals: 5 } }],
        },
      })
    })

    it('is refused when either receipt has no printed date to tell them apart', async () => {
      const { run } = send(atPlace, { reading }, 1, [{ reading: { date: null } }])
      await expect(run).resolves.toBe('duplicate')
    })

    it('is accepted when the same number was printed on another day', async () => {
      const { run } = send(atPlace, { reading }, 1, [{ reading: { date: '2026-10-20' } }])
      await expect(run).resolves.toBe('saved')
    })

    it('is accepted when nothing else has that number', async () => {
      const { run } = send(atPlace, { reading })
      await expect(run).resolves.toBe('saved')
    })

    it('is not checked without a number, and is flagged for the team instead', async () => {
      const unnumbered = sealReading({ ...read, number: null }, 9, JPEG)
      const { run, calls } = send(atPlace, { reading: unnumbered }, 1, [{}])
      await expect(run).resolves.toBe('saved')
      expect(calls.finds).toHaveLength(0)
      expect(calls.creates[0]).toMatchObject({ data: { reading: { concerns: ['number'] } } })
    })
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
