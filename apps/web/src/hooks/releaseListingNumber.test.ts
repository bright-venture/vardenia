import { describe, expect, it } from 'vitest'
import type { CollectionBeforeChangeHook } from 'payload'
import { releaseListingNumber } from './releaseListingNumber'

const run = (data: Record<string, unknown>, originalDoc: Record<string, unknown> = {}) =>
  (releaseListingNumber as CollectionBeforeChangeHook)({
    data,
    originalDoc,
    operation: 'update',
  } as never) as Record<string, unknown>

describe('releaseListingNumber', () => {
  it('clears the number when the submission is rejected', () => {
    expect(run({ submission: { status: 'rejected' } }, { listingNumber: 12 }).listingNumber).toBe(
      null,
    )
  })

  it('clears it when the stored status is already rejected (partial update)', () => {
    const out = run({ name: 'x' }, { listingNumber: 12, submission: { status: 'rejected' } })
    expect(out.listingNumber).toBe(null)
  })

  it('clears the number of a listing being trashed', () => {
    const out = run({ deletedAt: '2026-11-19T00:00:00Z' }, { listingNumber: 12 })
    expect(out.listingNumber).toBe(null)
  })

  it('keeps the number of an approved listing', () => {
    const data = { submission: { status: 'approved' } }
    expect(run(data, { listingNumber: 12 })).toBe(data)
  })

  it('leaves an untouched listing alone, and a restore from the trash', () => {
    const data = { name: 'x' }
    expect(run(data, { listingNumber: 12 })).toBe(data)
    expect(run({ deletedAt: null }, { listingNumber: null }).listingNumber).toBeUndefined()
  })
})

describe('releaseListingNumber, sample listings', () => {
  it('clears the number when isSample is true', () => {
    expect(run({ isSample: true, listingNumber: 5 }).listingNumber).toBe(null)
  })

  it('clears it on a partial update of a stored sample', () => {
    expect(run({ name: 'x' }, { isSample: true, listingNumber: 5 }).listingNumber).toBe(null)
  })

  it('keeps the number of a real listing', () => {
    const data = { name: 'x' }
    expect(run(data, { isSample: false, listingNumber: 5 })).toBe(data)
  })

  it('restoring a sample from the trash keeps no number', () => {
    expect(run({ deletedAt: null }, { isSample: true, listingNumber: null }).listingNumber).toBe(
      null,
    )
  })

  it('unticking does not restore a number', () => {
    expect(
      run({ isSample: false }, { isSample: true, listingNumber: null }).listingNumber,
    ).toBeUndefined()
  })
})

describe('releaseListingNumber, form submissions', () => {
  it.each(['abandoned', 'lapsed'])('clears the number when the submission is %s', (status) => {
    expect(run({ submission: { status } }, { listingNumber: 12 }).listingNumber).toBe(null)
    expect(run({}, { listingNumber: 12, submission: { status } }).listingNumber).toBe(null)
  })

  it.each(['incomplete', 'pending', 'accepted'])('keeps the number while %s', (status) => {
    const data = { submission: { status } }
    expect(run(data, { listingNumber: 12 })).toBe(data)
  })
})
