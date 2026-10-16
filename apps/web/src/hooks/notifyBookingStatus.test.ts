import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectionAfterChangeHook } from 'payload'

/**
 * Who hears about a status change. Only the automatic decline is covered here:
 * the guest must get the "no answer" email, and the venue must get nothing,
 * since it was the venue's request to answer.
 */

const sendBookingOutcome = vi.fn(async () => true)
const sendVenueCancellation = vi.fn(async () => true)

vi.mock('../lib/booking-email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/booking-email')>()),
  sendBookingOutcome,
  sendVenueCancellation,
  venueOwnerEmails: vi.fn(async () => ['owner@venue.lb']),
}))
vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))

const { notifyBookingStatus } = await import('./notifyBookingStatus')

type Args = Parameters<CollectionAfterChangeHook>[0]

const booking = {
  id: 1,
  business: 10,
  customer: 5,
  reference: 'ABCD1234',
  start: '2026-10-20T17:00:00.000Z',
  end: '2026-10-20T19:00:00.000Z',
  partySize: 2,
  locale: 'en',
}

const run = (context: Record<string, unknown>, user?: unknown) =>
  notifyBookingStatus({
    operation: 'update',
    doc: { ...booking, status: 'cancelled' },
    previousDoc: { ...booking, status: 'pending' },
    context,
    req: {
      user,
      payload: {
        findByID: vi.fn(async () => ({ email: 'guest@mail.com', name: 'Sami' })),
      },
    },
  } as unknown as Args)

describe('an unanswered request declined automatically', () => {
  beforeEach(() => {
    sendBookingOutcome.mockClear()
    sendVenueCancellation.mockClear()
  })

  it('tells the guest nobody answered, and leaves the venue alone', async () => {
    await run({ autoDeclined: true })
    expect(sendBookingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'guest@mail.com', outcome: 'expired' }),
    )
    expect(sendVenueCancellation).not.toHaveBeenCalled()
  })

  it('still treats a decline by staff as a decline, and tells the venue', async () => {
    await run({}, { id: 1, collection: 'users' })
    expect(sendBookingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'declined' }),
    )
    expect(sendVenueCancellation).toHaveBeenCalled()
  })
})
