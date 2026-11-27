import { describe, expect, it } from 'vitest'
import { LOCALES } from '@vardenia/i18n'
import { getMessages } from '@vardenia/i18n/messages'
import { createTranslator } from 'next-intl'

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
  // The description is no longer asked or previewed (27 November 2026).
  'form.description',
  'form.descriptionHint',
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

  // The two-stage payment (spec v4), with the Settings values interpolated.
  const VALUES = {
    percent: 50,
    downpayment: '$500',
    rest: '$500',
    downpaymentDays: 7,
    balanceDays: 30,
  }

  it.each(LOCALES)('%s formats the payment terms with every value filled in', (locale) => {
    const t = createTranslator({
      locale,
      messages: getMessages(locale) as never,
      namespace: 'magazinePlaces.flow' as never,
    }) as unknown as (key: string, values?: Record<string, unknown>) => string
    for (const key of ['termLine', 'payOnlyIf']) {
      const text = t(key, VALUES)
      expect(text, key).not.toMatch(/[{}]/)
      expect(text, key).toContain('$500')
    }
    expect(t('payOnlyIf', VALUES)).toContain('50')
    expect(t('payOnlyIf', VALUES)).toContain('Whish')
  })

  it('says the real flow in English and Arabic: downpayment, refund if not accepted, the rest', () => {
    const say = (locale: 'en' | 'ar', values: typeof VALUES) =>
      (
        createTranslator({
          locale,
          messages: getMessages(locale) as never,
          namespace: 'magazinePlaces.flow' as never,
        }) as unknown as (key: string, values?: Record<string, unknown>) => string
      )('payOnlyIf', values)
    expect(say('en', VALUES)).toContain('within 7 days')
    expect(say('en', VALUES)).toContain('within 1 month of acceptance')
    expect(say('en', VALUES)).toContain(
      'return the downpayment by Whish to the number it was paid from',
    )
    expect(say('en', { ...VALUES, downpaymentDays: 1, balanceDays: 45 })).toContain('within 1 day')
    expect(say('en', { ...VALUES, balanceDays: 45 })).toContain('within 45 days of acceptance')
    expect(say('ar', VALUES)).toContain('7 أيام')
    expect(say('ar', VALUES)).toContain('شهر واحد')
    expect(say('ar', { ...VALUES, balanceDays: 45 })).toContain('45 يومًا')
    for (const locale of LOCALES) {
      expect(JSON.stringify(places(locale)), locale).not.toMatch(/pay only if we accept/i)
    }
  })

  it('is written in Arabic in Arabic', () => {
    for (const value of Object.values(places('ar').flow as Record<string, string>)) {
      expect(value).toMatch(ARABIC)
    }
  })
})
