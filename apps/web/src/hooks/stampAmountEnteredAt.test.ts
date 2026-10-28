import { describe, expect, it } from 'vitest'
import { stampAmountEnteredAt } from './stampAmountEnteredAt'

const run = (originalDoc: Record<string, unknown> | undefined, data: Record<string, unknown>) =>
  stampAmountEnteredAt({ data, originalDoc, operation: 'update' } as never) as Record<
    string,
    unknown
  >

describe('stampAmountEnteredAt', () => {
  it('dates an amount when it is first given or changed', () => {
    expect(run({ amount: null }, { amount: 90 }).amountEnteredAt).toEqual(expect.any(String))
    expect(run({ amount: 90 }, { amount: 95 }).amountEnteredAt).toEqual(expect.any(String))
  })

  it('leaves the date alone when the amount is untouched', () => {
    expect(run({ amount: 90 }, { status: 'completed' })).not.toHaveProperty('amountEnteredAt')
    expect(run({ amount: 90 }, { amount: 90 })).not.toHaveProperty('amountEnteredAt')
  })
})
