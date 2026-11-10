import { describe, expect, it } from 'vitest'
import { stampStateOf } from '@vardenia/core'
import {
  CUT_DOWN,
  RETENTION,
  daysBefore,
  fateOf,
  monthsBefore,
  needsCutting,
  oldBookingsWhere,
  type OldBooking,
} from './retention'
import { privacyPolicy } from './legal'

const NOW = new Date('2028-06-15T12:00:00Z')
const longAgo = '2027-01-10T20:00:00Z'

const visit = (over: Partial<OldBooking> = {}): OldBooking => ({
  id: 1,
  status: 'completed',
  end: longAgo,
  customer: 7,
  guestAnswer: 'came',
  attendanceVerdict: null,
  ...over,
})

describe('which old bookings are kept for the passport', () => {
  it('keeps a real visit, cut down, so its stamp stays', () => {
    expect(fateOf(visit(), NOW, new Set())).toBe('cut-down')
  })

  it('deletes a booking that never became a visit', () => {
    for (const status of ['cancelled', 'pending'] as const) {
      expect(fateOf(visit({ status, guestAnswer: null }), NOW, new Set()), status).toBe('delete')
    }
    expect(fateOf(visit({ guestAnswer: 'did-not-come' }), NOW, new Set())).toBe('delete')
    expect(fateOf(visit({ status: 'no-show', guestAnswer: null }), NOW, new Set())).toBe('delete')
  })

  it('keeps a visit the team gave to the guest over a no-show', () => {
    expect(fateOf(visit({ status: 'no-show', attendanceVerdict: 'guest' }), NOW, new Set())).toBe(
      'cut-down',
    )
  })

  it('deletes every old booking of a closed account, which has no passport', () => {
    expect(fateOf(visit({ customer: 7 }), NOW, new Set(['7']))).toBe('delete')
    expect(fateOf(visit({ customer: null }), NOW, new Set())).toBe('delete')
  })

  /** The rule that matters: never keep less than the passport needs. */
  it('keeps every field a stamp is worked out from', () => {
    for (const field of [
      'status',
      'end',
      'guestAnswer',
      'attendanceVerdict',
      'business',
      'customer',
    ]) {
      expect(Object.keys(CUT_DOWN)).not.toContain(field)
    }
    const kept = { ...visit(), ...CUT_DOWN }
    expect(
      stampStateOf(
        {
          status: kept.status,
          end: new Date(kept.end),
          guestAnswer: kept.guestAnswer,
          verdict: null,
        },
        NOW,
      ),
    ).toBe('stamped')
  })

  it('clears the notes, receipt, amounts and staff notes from a kept visit', () => {
    for (const field of [
      'notes',
      'internalNotes',
      'declineReason',
      'receipt',
      'amount',
      'guestAmount',
      'receiptAmount',
    ]) {
      expect(CUT_DOWN[field], field).toBeNull()
    }
  })

  it('knows a kept visit that is already cut down', () => {
    expect(needsCutting({ ...visit(), ...CUT_DOWN })).toBe(false)
    expect(needsCutting({ ...visit(), ...CUT_DOWN, notes: 'nut allergy' })).toBe(true)
    expect(needsCutting({ ...visit(), ...CUT_DOWN, amount: 0 })).toBe(true)
  })
})

describe('dates', () => {
  it('counts calendar months and plain days', () => {
    expect(monthsBefore(NOW, 12).toISOString()).toBe('2027-06-15T12:00:00.000Z')
    expect(daysBefore(NOW, 90).toISOString()).toBe('2028-03-17T12:00:00.000Z')
  })

  it('only ever asks for bookings older than the cutoff', () => {
    const cutoff = monthsBefore(NOW, 12)
    const where = oldBookingsWhere(cutoff, ['3']) as { and: Record<string, unknown>[] }
    expect(where.and[0]).toEqual({ end: { less_than: cutoff.toISOString() } })
    expect(JSON.stringify(where)).toContain('"customer":{"in":["3"]}')
  })
})

/** The policy promises these numbers; the job must keep the same ones. */
describe('the privacy policy and the job agree', () => {
  const lines = privacyPolicy()
    .sections.flatMap((section) => section.body)
    .join(' ')

  it('names the same periods', () => {
    expect(RETENTION).toEqual({ bookingMonths: 12, scanMonths: 12, errorDays: 90 })
    expect(lines).toContain('**Records of printed-code scans**: 12 months.')
    expect(lines).toContain('**Error records**: 90 days.')
    expect(lines).toMatch(/\*\*Bookings\*\*[^-]*12 months after the visit/)
  })

  it('says a visit is kept for the passport, not deleted', () => {
    expect(lines).toMatch(/stamp stays in your passport until you close your account/)
  })
})
