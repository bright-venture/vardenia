import { describe, expect, it } from 'vitest'
import { assess, flagsFor, suggestionsFor, type BusinessPerformance } from './performance-report'

/**
 * The rules that pick out a business needing attention, and what to tell it.
 * Pure, so they are checked without a database.
 */

type Facts = Omit<BusinessPerformance, 'flags' | 'suggestions'>

const business = (over: Partial<Facts> = {}): Facts => ({
  id: 1,
  name: 'Chez Nouna',
  slug: 'chez-nouna',
  governorate: 'beirut',
  district: 'beirut',
  category: 'food-and-beverage',
  tier: 'silver',
  featured: false,
  bookingsOn: true,
  hasPartner: true,
  hasCode: true,
  scans: 20,
  scansBefore: 20,
  places: [],
  requests: 5,
  pending: 0,
  confirmed: 1,
  completed: 4,
  noShows: 0,
  cancelled: 0,
  came: 4,
  absent: 0,
  disputes: 0,
  guests: 10,
  answerHours: 2,
  missing: {
    photograph: false,
    hours: false,
    description: false,
    arabicName: false,
    location: false,
  },
  ...over,
})

const context = { medianScans: 20, overallNoShowRate: 0.1 }
const textOf = (b: Facts) =>
  suggestionsFor(b, flagsFor(b, context))
    .map((s) => s.text)
    .join(' ')

describe('flags', () => {
  it('leaves a healthy business alone', () => {
    expect(flagsFor(business(), context)).toEqual([])
  })

  it('flags disputed visits', () => {
    expect(flagsFor(business({ disputes: 2 }), context)).toContain('disputes')
  })

  it('flags no-shows only above the floor and with enough visits', () => {
    expect(flagsFor(business({ completed: 6, noShows: 4 }), context)).toContain('no-shows')
    // Two of three is a high rate, but too few visits to call it a pattern.
    expect(flagsFor(business({ completed: 1, noShows: 2 }), context)).not.toContain('no-shows')
  })

  it('flags few scans against the median, and only for a listing with a code', () => {
    expect(flagsFor(business({ scans: 2 }), context)).toContain('low-scans')
    expect(flagsFor(business({ scans: 2, hasCode: false }), context)).not.toContain('low-scans')
  })

  it('flags falling scans, people looking but not booking, and slow answers', () => {
    expect(flagsFor(business({ scans: 8, scansBefore: 30 }), context)).toContain('falling-scans')
    expect(flagsFor(business({ scans: 15, requests: 0 }), context)).toContain('looked-not-booked')
    expect(flagsFor(business({ answerHours: 20 }), context)).toContain('slow-answers')
  })

  it('flags an incomplete page', () => {
    const missing = { ...business().missing, photograph: true }
    expect(flagsFor(business({ missing }), context)).toContain('incomplete-page')
  })
})

describe('suggestions', () => {
  it('tells a listing nobody can book to switch bookings on', () => {
    expect(textOf(business({ scans: 15, requests: 0, bookingsOn: false }))).toMatch(
      /switch on table bookings/,
    )
  })

  it('keeps team actions off the business report', () => {
    const b = business({ disputes: 1, completed: 6, noShows: 4 })
    const tips = suggestionsFor(b, flagsFor(b, context))
    const team = tips
      .filter((s) => s.forTeam)
      .map((s) => s.text)
      .join(' ')
    const theirs = tips
      .filter((s) => !s.forTeam)
      .map((s) => s.text)
      .join(' ')
    expect(team).toMatch(/disputed visit/)
    expect(team).toMatch(/mystery visit/)
    expect(theirs).not.toMatch(/mystery|disputed/)
  })

  it('names what the page is missing', () => {
    const missing = {
      photograph: true,
      hours: true,
      description: false,
      arabicName: false,
      location: false,
    }
    const text = textOf(business({ missing }))
    expect(text).toMatch(/photographs/)
    expect(text).toMatch(/opening hours/)
  })
})

describe('assess', () => {
  it('works out the median and the overall no-show rate across businesses', () => {
    const { context: c } = assess([
      business({ id: 1, scans: 10, completed: 9, noShows: 1 }),
      business({ id: 2, scans: 30, completed: 9, noShows: 1 }),
      business({ id: 3, scans: 0, hasCode: false, completed: 0 }),
    ])
    expect(c.medianScans).toBe(20)
    // 2 no-shows out of 20 finished visits (9 + 1, twice).
    expect(c.overallNoShowRate).toBeCloseTo(2 / 20)
  })
})
