import { describe, expect, it } from 'vitest'
import { listingState } from './listing-state'

const NOW = new Date('2026-11-20T12:00:00Z')
const past = '2026-11-01T00:00:00.000Z'
const future = '2027-11-01T00:00:00.000Z'

describe('listingState', () => {
  it('reads Published for a live listing', () => {
    expect(listingState({ _status: 'published', contractEndsAt: future }, NOW)).toBe('published')
  })

  it('reads Draft for a new submission waiting for review', () => {
    expect(listingState({ _status: 'draft', submission: { status: 'pending' } }, NOW)).toBe('draft')
  })

  it('reads Rejected for a rejected submission, whatever else it holds', () => {
    expect(listingState({ _status: 'draft', submission: { status: 'rejected' } }, NOW)).toBe(
      'rejected',
    )
  })

  it('reads Expired when the daily job marked the submission', () => {
    expect(listingState({ _status: 'draft', submission: { status: 'expired' } }, NOW)).toBe(
      'expired',
    )
  })

  it('reads Expired for any hidden listing whose contract has ended', () => {
    expect(listingState({ _status: 'draft', contractEndsAt: past }, NOW)).toBe('expired')
  })

  it('reads Published again once renewed', () => {
    expect(
      listingState(
        { _status: 'published', submission: { status: 'approved' }, contractEndsAt: future },
        NOW,
      ),
    ).toBe('published')
  })

  it('gives the job its one day of grace before calling it Expired', () => {
    expect(
      listingState({ _status: 'draft', contractEndsAt: '2026-11-20T00:00:00.000Z' }, NOW),
    ).toBe('draft')
  })

  it('reads Draft for a listing with nothing set', () => {
    expect(listingState({}, NOW)).toBe('draft')
    expect(listingState(null, NOW)).toBe('draft')
  })
})

describe('unfinished Magazine Places forms', () => {
  it('reads Incomplete and Abandoned, not Draft', () => {
    expect(listingState({ _status: 'draft', submission: { status: 'incomplete' } }, NOW)).toBe(
      'incomplete',
    )
    expect(listingState({ _status: 'draft', submission: { status: 'abandoned' } }, NOW)).toBe(
      'abandoned',
    )
  })

  it('a pending submission is still Draft', () => {
    expect(listingState({ _status: 'draft', submission: { status: 'pending' } }, NOW)).toBe('draft')
  })

  it('isUnfinishedForm is true only for incomplete and abandoned', async () => {
    const { isUnfinishedForm } = await import('./listing-state')
    expect(isUnfinishedForm({ submission: { status: 'incomplete' } })).toBe(true)
    expect(isUnfinishedForm({ submission: { status: 'abandoned' } })).toBe(true)
    for (const status of ['pending', 'accepted', 'approved', 'rejected', undefined]) {
      expect(isUnfinishedForm({ submission: { status } })).toBe(false)
    }
    expect(isUnfinishedForm(null)).toBe(false)
  })
})
