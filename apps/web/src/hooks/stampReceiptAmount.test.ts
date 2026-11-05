import { describe, expect, it, vi } from 'vitest'
import {
  REFRESH_RECEIPT_AMOUNT,
  refreshBookingAfterReceiptDelete,
  refreshBookingFromReceipt,
  stampReceiptAmount,
} from './stampReceiptAmount'

/**
 * The booking's copy of its receipt's total, which billing takes first: set
 * when the receipt is linked, followed when staff correct it, and in dollars.
 */

function request(receipts: Record<string, { amount: number | null; currency: string }>, rate = 0) {
  const update = vi.fn(async () => ({}))
  const req = {
    payload: {
      findByID: vi.fn(async ({ id }: { id: number }) => {
        const found = receipts[String(id)]
        if (!found) throw new Error('not found')
        return found
      }),
      findGlobal: vi.fn(async () => ({ poundsPerDollar: rate || null })),
      update,
    },
  }
  return { req, update }
}

type Hook = typeof stampReceiptAmount
const run = (args: Partial<Parameters<Hook>[0]>) =>
  stampReceiptAmount(args as Parameters<Hook>[0]) as Promise<Record<string, unknown>>

describe('the receipt total on the booking', () => {
  it('is set in dollars when a receipt is linked', async () => {
    const { req } = request({ 9: { amount: 84.5, currency: 'USD' } })
    const data = await run({
      data: { receipt: 9 },
      originalDoc: { receipt: null },
      req: req as never,
    })
    expect(data.receiptAmount).toBe(84.5)
  })

  it('converts a receipt in pounds at the rate on the Commissions page', async () => {
    const { req } = request({ 9: { amount: 2_685_000, currency: 'LBP' } }, 89_500)
    const data = await run({ data: { receipt: 9 }, originalDoc: {}, req: req as never })
    expect(data.receiptAmount).toBe(30)
  })

  it('gives no figure for pounds while no rate is set', async () => {
    const { req } = request({ 9: { amount: 2_685_000, currency: 'LBP' } })
    const data = await run({ data: { receipt: 9 }, originalDoc: {}, req: req as never })
    expect(data.receiptAmount).toBeNull()
  })

  it('is left alone by an ordinary save that does not touch the receipt', async () => {
    const { req } = request({ 9: { amount: 84.5, currency: 'USD' } })
    const data = await run({
      data: { status: 'completed', receipt: 9 },
      originalDoc: { receipt: 9, receiptAmount: 84.5 },
      req: req as never,
    })
    expect('receiptAmount' in data).toBe(false)
    expect(req.payload.findByID).not.toHaveBeenCalled()
  })

  it('is read again when the receipt asks, and cleared when the receipt is gone', async () => {
    const { req } = request({ 9: { amount: 90, currency: 'USD' } })
    const refreshed = await run({
      data: {},
      originalDoc: { receipt: 9, receiptAmount: 84.5 },
      req: req as never,
      context: { [REFRESH_RECEIPT_AMOUNT]: true },
    })
    expect(refreshed.receiptAmount).toBe(90)

    const cleared = await run({
      data: {},
      originalDoc: { receipt: null, receiptAmount: 84.5 },
      req: req as never,
      context: { [REFRESH_RECEIPT_AMOUNT]: true },
    })
    expect(cleared.receiptAmount).toBeNull()
  })
})

describe('a receipt telling its booking', () => {
  type After = typeof refreshBookingFromReceipt
  const after = (args: Partial<Parameters<After>[0]>) =>
    refreshBookingFromReceipt(args as Parameters<After>[0])

  it('refreshes the booking when staff correct the total', async () => {
    const { req, update } = request({})
    await after({
      operation: 'update',
      doc: { booking: 41, amount: 90, currency: 'USD' },
      previousDoc: { booking: 41, amount: 84.5, currency: 'USD' },
      req: req as never,
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 41, context: { [REFRESH_RECEIPT_AMOUNT]: true } }),
    )
  })

  it('leaves the booking alone when neither the total nor the currency changed', async () => {
    const { req, update } = request({})
    await after({
      operation: 'update',
      doc: { booking: 41, amount: 84.5, currency: 'USD', note: 'checked' },
      previousDoc: { booking: 41, amount: 84.5, currency: 'USD' },
      req: req as never,
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('refreshes the booking when the receipt is deleted', async () => {
    const { req, update } = request({})
    await refreshBookingAfterReceiptDelete({
      doc: { booking: { id: 41 } },
      req,
    } as unknown as Parameters<typeof refreshBookingAfterReceiptDelete>[0])
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 41 }))
  })
})
