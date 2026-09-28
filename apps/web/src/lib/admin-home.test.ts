import { describe, expect, it } from 'vitest'
import { waitingRequest } from './admin-home'

/**
 * An unanswered booking request on the admin home: how long the guest has
 * waited, when for, and how urgent it is.
 */
describe('waitingRequest', () => {
  const now = new Date('2026-09-28T09:00:00Z')

  it('counts hours for the first two days, then days', () => {
    expect(waitingRequest('2026-09-27T06:00:00Z', '2026-10-10T17:00:00Z', now).detail).toMatch(
      /^Waiting 27 hours, for 10 Oct 2026, 20:00\./,
    )
    expect(waitingRequest('2026-09-24T09:00:00Z', '2026-10-10T17:00:00Z', now).detail).toMatch(
      /^Waiting 4 days/,
    )
  })

  it('is a warning when the booking is days away, and says to phone the venue', () => {
    const result = waitingRequest('2026-09-27T06:00:00Z', '2026-10-10T17:00:00Z', now)
    expect(result.tone).toBe('warn')
    expect(result.detail).toContain('Phone the venue')
  })

  it('is urgent when the booking is within two days', () => {
    expect(waitingRequest('2026-09-27T06:00:00Z', '2026-09-29T17:00:00Z', now).tone).toBe('error')
  })

  it('is urgent, and says so, when the booking has already passed', () => {
    const result = waitingRequest('2026-08-02T06:00:00Z', '2026-08-18T14:00:00Z', now)
    expect(result.tone).toBe('error')
    expect(result.detail).toContain('which has passed')
  })
})
