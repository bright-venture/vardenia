import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { DEFAULT_PLACE_SETTINGS, getPlaceSettings, placeSettingsFrom } from './place-settings'

describe('placeSettingsFrom', () => {
  it('has the agreed defaults', () => {
    expect(DEFAULT_PLACE_SETTINGS).toEqual({
      pricePerYear: 20,
      currency: 'USD',
      termMonths: 12,
      paymentDeadlineDays: 7,
      holdMinutes: 30,
      whishNumber: '+96179300350',
      termsVersion: '2026-11',
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
          paymentDeadlineDays: 3,
          holdMinutes: 15,
          whishNumber: ' +96171000000 ',
          termsVersion: '2027-01',
        },
      }),
    ).toEqual({
      pricePerYear: 35,
      currency: 'EUR',
      termMonths: 6,
      paymentDeadlineDays: 3,
      holdMinutes: 15,
      whishNumber: '+96171000000',
      termsVersion: '2027-01',
    })
  })

  it('allows a free year but ignores unusable numbers', () => {
    expect(placeSettingsFrom({ magazinePlaces: { pricePerYear: 0 } }).pricePerYear).toBe(0)
    const bad = placeSettingsFrom({
      magazinePlaces: {
        pricePerYear: -1,
        termMonths: 0,
        paymentDeadlineDays: 2.5,
        holdMinutes: '30',
        whishNumber: '  ',
        currency: '',
      },
    })
    expect(bad).toEqual(DEFAULT_PLACE_SETTINGS)
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
