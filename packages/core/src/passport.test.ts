import { describe, expect, it } from 'vitest'
import {
  buildPassport,
  POINTS_NEW_PLACE,
  POINTS_RETURN_VISIT,
  stampStateOf,
  type PassportVisit,
} from './passport'

const NOW = new Date('2026-10-20T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

const visit = (over: Partial<PassportVisit> = {}): PassportVisit => ({
  businessId: '1',
  status: 'completed',
  end: daysAgo(30),
  category: 'food-and-beverage',
  governorate: 'beirut',
  ...over,
})

describe('what stamps', () => {
  it('stamps a booking the venue marked completed, the same day', () => {
    expect(stampStateOf(visit({ end: daysAgo(0.1) }), NOW)).toBe('stamped')
  })

  it('stamps a confirmed booking left unmarked for a week', () => {
    expect(stampStateOf(visit({ status: 'confirmed', end: daysAgo(8) }), NOW)).toBe('stamped')
  })

  it('holds a confirmed booking inside the week as pending', () => {
    expect(stampStateOf(visit({ status: 'confirmed', end: daysAgo(2) }), NOW)).toBe('pending')
  })

  it('gives nothing for a booking that has not happened yet', () => {
    expect(stampStateOf(visit({ status: 'confirmed', end: daysAgo(-3) }), NOW)).toBeNull()
  })

  it('gives nothing for a no-show, a cancellation or a request', () => {
    for (const status of ['no-show', 'cancelled', 'pending'] as const) {
      expect(stampStateOf(visit({ status }), NOW)).toBeNull()
    }
  })
})

describe('the passport', () => {
  it('is empty for a guest who has been nowhere', () => {
    const passport = buildPassport([], NOW)
    expect(passport.stamps).toEqual([])
    expect(passport.points).toBe(0)
    expect(passport.milestones.every((m) => !m.reached && m.count === 0)).toBe(true)
  })

  it('gives one stamp per place, dated by the first visit, and counts returns', () => {
    const passport = buildPassport(
      [visit({ end: daysAgo(10) }), visit({ end: daysAgo(40) }), visit({ end: daysAgo(20) })],
      NOW,
    )
    expect(passport.stamps).toHaveLength(1)
    expect(passport.stamps[0]!.visits).toBe(3)
    expect(passport.stamps[0]!.stampedOn).toEqual(daysAgo(40))
    expect(passport.points).toBe(POINTS_NEW_PLACE + 2 * POINTS_RETURN_VISIT)
  })

  it('does not show a place as pending once it is already stamped', () => {
    const passport = buildPassport(
      [visit({ end: daysAgo(30) }), visit({ status: 'confirmed', end: daysAgo(1) })],
      NOW,
    )
    expect(passport.stamps).toHaveLength(1)
    expect(passport.pending).toEqual([])
    // The return visit is not counted until it stamps.
    expect(passport.points).toBe(POINTS_NEW_PLACE)
  })

  it('says when a pending stamp lands', () => {
    const passport = buildPassport(
      [visit({ businessId: '2', status: 'confirmed', end: daysAgo(2) })],
      NOW,
    )
    expect(passport.stamps).toEqual([])
    expect(passport.pending).toEqual([{ businessId: '2', landsBy: daysAgo(-5) }])
  })

  it('counts sections and regions toward the milestones', () => {
    const passport = buildPassport(
      [
        visit({ businessId: '1', category: 'hospitality', governorate: 'beirut' }),
        visit({ businessId: '2', category: 'tourism', governorate: 'mount-lebanon' }),
        visit({ businessId: '3', category: 'food-and-beverage', governorate: 'north-lebanon' }),
        // An unknown category or governorate counts as a place, nothing more.
        visit({ businessId: '4', category: 'nonsense', governorate: null }),
      ],
      NOW,
    )
    const byKey = Object.fromEntries(passport.milestones.map((m) => [m.key, m]))
    expect(byKey.first!.reached).toBe(true)
    expect(byKey.five!.count).toBe(4)
    expect(byKey.threeSections!.reached).toBe(true)
    expect(byKey.allSections!.count).toBe(3)
    expect(byKey.allSections!.target).toBe(7)
    expect(byKey.threeRegions!.count).toBe(3)
    expect(byKey.allRegions!.target).toBe(8)
  })
})
