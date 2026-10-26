import { describe, expect, it, vi } from 'vitest'

const alertTeam = vi.fn(async () => {})
vi.mock('../lib/attendance', () => ({ alertTeam }))

const { alertAttendanceMismatch } = await import('./alertAttendanceMismatch')

/**
 * The guest said "I came" and the venue marks the booking a no-show afterwards:
 * the team hears about it once.
 */
const run = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  alertAttendanceMismatch({
    doc: { id: 7, end: '2026-11-01T20:00:00Z', ...after },
    previousDoc: { id: 7, end: '2026-11-01T20:00:00Z', ...before },
    operation: 'update',
    req: { payload: {} },
    context: {},
  } as never)

describe('alertAttendanceMismatch', () => {
  it('alerts when the venue contradicts a guest who said they came', async () => {
    alertTeam.mockClear()
    await run(
      { status: 'confirmed', guestAnswer: 'came' },
      { status: 'no-show', guestAnswer: 'came' },
    )
    expect(alertTeam).toHaveBeenCalledWith({}, 7, 'guest-says-came')
  })

  it('stays quiet when nothing disagrees, the team has decided, or the status did not change', async () => {
    alertTeam.mockClear()
    await run({ status: 'confirmed' }, { status: 'no-show' })
    await run(
      { status: 'confirmed', guestAnswer: 'came' },
      { status: 'no-show', guestAnswer: 'came', attendanceVerdict: 'venue' },
    )
    await run(
      { status: 'no-show', guestAnswer: 'came' },
      { status: 'no-show', guestAnswer: 'came' },
    )
    expect(alertTeam).not.toHaveBeenCalled()
  })
})
