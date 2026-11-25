import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { DEFAULT_PLACE_SETTINGS, getPlaceSettings, placeSettingsFrom } from './place-settings'

describe('placeSettingsFrom', () => {
  it('has the agreed defaults', () => {
    expect(DEFAULT_PLACE_SETTINGS).toEqual({
      pricePerYear: 1000,
      currency: 'USD',
      termMonths: 12,
      downpaymentPercent: 50,
      downpaymentDeadlineDays: 7,
      downpaymentReminderDay: 5,
      balanceDeadlineDays: 30,
      balanceReminderDaysBefore: 3,
      holdMinutes: 30,
      whishNumber: '+96179300350',
      termsVersion: '2026-11-24',
    })
  })

  it('uses the defaults when nothing is set', () => {
    for (const raw of [null, undefined, {}, { magazinePlaces: null }, { magazinePlaces: {} }]) {
      expect(placeSettingsFrom(raw)).toEqual(DEFAULT_PLACE_SETTINGS)
    }
  })

  it('uses what an admin saved', () => {
    expect(
      placeSettingsFrom({
        magazinePlaces: {
          pricePerYear: 35,
          currency: 'eur',
          termMonths: 6,
          downpaymentPercent: 25,
          downpaymentDeadlineDays: 10,
          downpaymentReminderDay: 8,
          balanceDeadlineDays: 60,
          balanceReminderDaysBefore: 5,
          holdMinutes: 15,
          whishNumber: ' +96171000000 ',
          termsVersion: '2027-01',
        },
      }),
    ).toEqual({
      pricePerYear: 35,
      currency: 'EUR',
      termMonths: 6,
      downpaymentPercent: 25,
      downpaymentDeadlineDays: 10,
      downpaymentReminderDay: 8,
      balanceDeadlineDays: 60,
      balanceReminderDaysBefore: 5,
      holdMinutes: 15,
      whishNumber: '+96171000000',
      termsVersion: '2027-01',
    })
  })

  it('never reads a free year (price below 1 falls back), and ignores unusable numbers', () => {
    expect(placeSettingsFrom({ magazinePlaces: { pricePerYear: 0 } }).pricePerYear).toBe(1000)
    expect(placeSettingsFrom({ magazinePlaces: { pricePerYear: 0.5 } }).pricePerYear).toBe(1000)
    expect(placeSettingsFrom({ magazinePlaces: { pricePerYear: 1 } }).pricePerYear).toBe(1)
    const bad = placeSettingsFrom({
      magazinePlaces: {
        pricePerYear: -1,
        termMonths: 0,
        downpaymentPercent: 0,
        downpaymentDeadlineDays: 2.5,
        downpaymentReminderDay: -1,
        balanceDeadlineDays: '30',
        // 0 is valid ("no reminder"); a negative number is not.
        balanceReminderDaysBefore: -3,
        holdMinutes: '30',
        whishNumber: '  ',
        currency: '',
      },
    })
    expect(bad).toEqual(DEFAULT_PLACE_SETTINGS)
  })
})

describe('placeSettingsFrom: percent and reminders', () => {
  it('takes a percent above 0 up to 100, decimals allowed', () => {
    expect(
      placeSettingsFrom({ magazinePlaces: { downpaymentPercent: 100 } }).downpaymentPercent,
    ).toBe(100)
    expect(
      placeSettingsFrom({ magazinePlaces: { downpaymentPercent: 12.5 } }).downpaymentPercent,
    ).toBe(12.5)
    for (const bad of [0, -5, 101, Number.NaN, '50', null]) {
      expect(
        placeSettingsFrom({ magazinePlaces: { downpaymentPercent: bad } }).downpaymentPercent,
      ).toBe(50)
    }
  })

  it('drops a reminder that would come on or after its deadline', () => {
    const s = placeSettingsFrom({
      magazinePlaces: {
        downpaymentDeadlineDays: 4,
        downpaymentReminderDay: 4,
        balanceDeadlineDays: 3,
        balanceReminderDaysBefore: 3,
      },
    })
    // Day 4 of a 4-day deadline is the deadline itself: one day before instead.
    expect(s.downpaymentReminderDay).toBe(3)
    // 3 days before a 3-day deadline is the day it starts: the latest useful day instead.
    expect(s.balanceReminderDaysBefore).toBe(2)
    // A one-day deadline leaves no room for a reminder: 0 means none.
    const tight = placeSettingsFrom({
      magazinePlaces: { downpaymentDeadlineDays: 1, balanceDeadlineDays: 1 },
    })
    expect(tight.downpaymentReminderDay).toBe(0)
    expect(tight.balanceReminderDaysBefore).toBe(0)
  })

  it('keeps a reminder set to 0 (no reminder), as the admin help says', () => {
    const s = placeSettingsFrom({
      magazinePlaces: { downpaymentReminderDay: 0, balanceReminderDaysBefore: 0 },
    })
    expect(s.downpaymentReminderDay).toBe(0)
    expect(s.balanceReminderDaysBefore).toBe(0)
    for (const bad of [-1, 2.5, '3', null]) {
      expect(
        placeSettingsFrom({ magazinePlaces: { downpaymentReminderDay: bad } })
          .downpaymentReminderDay,
      ).toBe(5)
    }
  })

  it('no longer has the single payment deadline', () => {
    expect(
      'paymentDeadlineDays' in placeSettingsFrom({ magazinePlaces: { paymentDeadlineDays: 3 } }),
    ).toBe(false)
  })
})

describe('getPlaceSettings', () => {
  it('reads the global with access overridden', async () => {
    const findGlobal = vi.fn().mockResolvedValue({ magazinePlaces: { pricePerYear: 25 } })
    const out = await getPlaceSettings({ findGlobal } as unknown as Payload)
    expect(out.pricePerYear).toBe(25)
    expect(findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'settings', overrideAccess: true }),
    )
  })

  it('falls back to the defaults when the read fails', async () => {
    const findGlobal = vi.fn().mockRejectedValue(new Error('db down'))
    expect(await getPlaceSettings({ findGlobal } as unknown as Payload)).toEqual(
      DEFAULT_PLACE_SETTINGS,
    )
  })
})
