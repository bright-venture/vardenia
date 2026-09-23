import { describe, expect, it } from 'vitest'
import { LOCALE_CODES } from '@vardenia/core'
import { LOCALES } from '@vardenia/i18n'

/**
 * core keeps its own copy of the language list, because it cannot depend on
 * @vardenia/i18n - see packages/core/src/locales. This is what keeps the copy
 * honest.
 *
 * The failure it prevents has already happened once. The request schemas in
 * core allowed English and Arabic; i18n grew to ten; every booking and sign-up
 * from the other eight was refused with a 400 that no page explained. Here,
 * adding an eleventh language to i18n without core fails the build instead.
 */
describe('the language lists', () => {
  it('are the same in core and in i18n, in the same order', () => {
    expect([...LOCALE_CODES]).toEqual([...LOCALES])
  })
})
