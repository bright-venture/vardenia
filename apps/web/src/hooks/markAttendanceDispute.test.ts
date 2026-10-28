import { describe, expect, it } from 'vitest'
import { markAttendanceDispute } from './markAttendanceDispute'

const run = (originalDoc: Record<string, unknown> | undefined, data: Record<string, unknown>) =>
  markAttendanceDispute({ data, originalDoc, operation: 'update' } as never) as Record<
    string,
    unknown
  >

const visit = { status: 'no-show', end: '2026-11-01T20:00:00Z' }

describe('markAttendanceDispute', () => {
  it('flags a visit when the guest says they came to a no-show', () => {
    expect(run(visit, { guestAnswer: 'came' }).attendanceDisputed).toBe(true)
  })

  it('clears it once the team decides, either way', () => {
    const disputed = { ...visit, guestAnswer: 'came', attendanceDisputed: true }
    expect(run(disputed, { attendanceVerdict: 'guest' }).attendanceDisputed).toBe(false)
    expect(run(disputed, { attendanceVerdict: 'venue' }).attendanceDisputed).toBe(false)
  })

  it('flags it when the venue marks a no-show after the guest said they came', () => {
    const answered = { status: 'confirmed', end: visit.end, guestAnswer: 'came' }
    expect(run(answered, { status: 'no-show' }).attendanceDisputed).toBe(true)
  })

  it('leaves an ordinary visit undisputed', () => {
    expect(
      run({ status: 'completed', end: visit.end }, { guestAnswer: 'came' }).attendanceDisputed,
    ).toBe(false)
  })
})

describe('markAttendanceDispute, on what was spent', () => {
  const done = { status: 'completed', end: visit.end, guestAnswer: 'came', guestAmount: 120 }

  it('flags a venue amount far from the guest one', () => {
    expect(run(done, { amount: 40 }).attendanceDisputed).toBe(true)
  })

  it('leaves amounts that roughly agree alone', () => {
    expect(run(done, { amount: 110 }).attendanceDisputed).toBe(false)
  })
})
