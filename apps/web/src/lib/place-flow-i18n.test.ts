import { describe, expect, it } from 'vitest'
import { LOCALES } from '@vardenia/i18n'
import { getMessages } from '@vardenia/i18n/messages'

/**
 * The big-screen Magazine Places flow (steps 1 to 4): every locale has the same
 * magazinePlaces tree, the new `flow` keys are filled, Arabic is written in
 * Arabic (the other locales carry English, flagged for native review), and the
 * keys the old single-page form orphaned are gone from every locale.
 */

type Tree = Record<string, unknown>
const places = (locale: (typeof LOCALES)[number]) =>
  (getMessages(locale) as unknown as Tree).magazinePlaces as Tree

const paths = (tree: Tree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? paths(value as Tree, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )

const ARABIC = /[؀-ۿ]/

const REMOVED = [
  'form.subcategories',
  'form.subcategoriesHint',
  'form.hoursLegend',
  'form.hoursHint',
  'form.opens',
  'form.closed',
  'form.priceRange',
  'form.noPriceRange',
  'form.amenities',
  'form.payments',
  'form.paymentCash',
  'form.paymentCard',
  'form.paymentOmt',
  'form.success',
  'errors.photos',
  'errors.hotelAndGetaway',
]

describe('magazinePlaces flow messages', () => {
  const english = paths(places('en')).sort()

  it('has the keys the flow uses', () => {
    const flow = places('en').flow as Record<string, string>
    for (const key of [
      'next',
      'qrInstruction',
      'cantScan',
      'expired',
      'startAgain',
      'tooManyOpen',
      'payOnlyIf',
      'accept',
      'submit',
      'thanks',
      'startNew',
      'idleStay',
    ]) {
      expect(flow[key], key).toBeTruthy()
    }
  })

  it.each(LOCALES)('%s has the same keys as English, all filled', (locale) => {
    expect(paths(places(locale)).sort()).toEqual(english)
    const flow = places(locale).flow as Record<string, string>
    for (const [key, value] of Object.entries(flow)) expect(value, key).not.toBe('')
  })

  it.each(LOCALES)('%s no longer carries the orphaned keys', (locale) => {
    const have = new Set(paths(places(locale)))
    for (const key of REMOVED) expect(have.has(key), key).toBe(false)
  })

  it('is written in Arabic in Arabic', () => {
    for (const value of Object.values(places('ar').flow as Record<string, string>)) {
      expect(value).toMatch(ARABIC)
    }
  })
})
