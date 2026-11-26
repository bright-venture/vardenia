import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { hideLapsedListings, lapseCutoff, lapsedListingsWhere } from './contract-lapse'

/** "Contract ends 15 January", as the admin stores it: midnight in Beirut. */
const ENDS = new Date('2027-01-14T22:00:00.000Z')

describe('when a contract has ended', () => {
  const ended = (now: string) => ENDS < lapseCutoff(new Date(now))

  it('is still running all of the last day', () => {
    expect(ended('2027-01-15T03:41:00.000Z')).toBe(false)
    expect(ended('2027-01-15T21:59:00.000Z')).toBe(false)
  })

  it('has ended when the job runs the next morning', () => {
    expect(ended('2027-01-16T03:41:00.000Z')).toBe(true)
  })

  it('only looks at published listings with a date before the cutoff', () => {
    expect(lapsedListingsWhere(new Date('2027-01-16T03:41:00.000Z'))).toEqual({
      and: [
        { _status: { equals: 'published' } },
        { contractEndsAt: { less_than: '2027-01-15T03:41:00.000Z' } },
      ],
    })
  })
})

describe('hiding lapsed listings', () => {
  const fake = (ids: number[]) => {
    const update = vi.fn(async () => ({}))
    const payload = {
      find: vi.fn(async () => ({ docs: ids.map((id) => ({ id })) })),
      update,
      logger: { error: vi.fn() },
    } as unknown as Payload
    return { payload, update }
  }

  it('sets each one back to draft, through Payload so the caches clear', async () => {
    const { payload, update } = fake([4, 9])
    expect(await hideLapsedListings(payload)).toEqual({ hidden: 2, failed: 0 })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'businesses', id: 4, data: { _status: 'draft' } }),
    )
  })

  it('changes nothing on a dry run', async () => {
    const { payload, update } = fake([4, 9])
    expect(await hideLapsedListings(payload, { dryRun: true })).toEqual({ hidden: 2, failed: 0 })
    expect(update).not.toHaveBeenCalled()
  })

  it('marks a listing that came through the form as Expired, keeping its submission', async () => {
    const submission = { status: 'approved', ownerEmail: 'owner@example.com', ownerName: 'Rana' }
    const update = vi.fn(async () => ({}))
    const payload = {
      find: vi.fn(async () => ({
        docs: [
          { id: 7, submission },
          { id: 8, submission: {} },
        ],
      })),
      update,
      logger: { error: vi.fn() },
    } as unknown as Payload
    await hideLapsedListings(payload)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        data: { _status: 'draft', submission: { ...submission, status: 'expired' } },
      }),
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8, data: { _status: 'draft' } }),
    )
  })

  it('carries on past one that fails', async () => {
    const { payload, update } = fake([4, 9])
    update.mockRejectedValueOnce(new Error('locked'))
    expect(await hideLapsedListings(payload)).toEqual({ hidden: 1, failed: 1 })
  })
})
