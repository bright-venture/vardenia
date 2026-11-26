import { describe, expect, it } from 'vitest'
import type { CollectionBeforeChangeHook } from 'payload'
import { syncOwnerPhoneSearch } from './syncOwnerPhoneSearch'

const run = (data: Record<string, unknown>) =>
  (syncOwnerPhoneSearch as CollectionBeforeChangeHook)({ data, operation: 'update' } as never) as {
    submission?: Record<string, unknown>
  }

describe('syncOwnerPhoneSearch', () => {
  it('writes the normalised phone next to the one typed', () => {
    expect(run({ submission: { ownerPhone: '+961 3 123 456' } }).submission).toEqual({
      ownerPhone: '+961 3 123 456',
      ownerPhoneSearch: '03123456',
    })
  })

  it('clears it when the phone is cleared', () => {
    expect(run({ submission: { ownerPhone: '' } }).submission?.ownerPhoneSearch).toBeNull()
  })

  it('never takes the search value from the request', () => {
    const out = run({ submission: { ownerPhone: '03 123 456', ownerPhoneSearch: 'forged' } })
    expect(out.submission?.ownerPhoneSearch).toBe('03123456')
    expect(
      run({ submission: { status: 'pending', ownerPhoneSearch: 'forged' } }).submission,
    ).toEqual({ status: 'pending' })
  })

  it('leaves a save without a submission alone', () => {
    const data = { name: 'x' }
    expect(run(data)).toBe(data)
  })
})
