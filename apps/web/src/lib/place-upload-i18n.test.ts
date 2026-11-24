import { describe, expect, it } from 'vitest'
import { LOCALES } from '@vardenia/i18n'
import { getMessages } from '@vardenia/i18n/messages'

/**
 * The phone photo upload page (Magazine Places, step 2): every locale has every
 * key, filled, and Arabic is written in Arabic. The other locales carry the
 * English wording for now (flagged for a native review).
 */

type Tree = Record<string, unknown>
const upload = (locale: (typeof LOCALES)[number]) =>
  ((getMessages(locale) as unknown as Tree).magazinePlaces as Tree).upload as Record<string, string>

const ARABIC = /[؀-ۿ]/

describe('magazinePlaces.upload messages', () => {
  const english = upload('en')

  it('has the keys the page uses', () => {
    for (const key of [
      'title',
      'intro',
      'logoLabel',
      'heroLabel',
      'hint',
      'sending',
      'received',
      'failed',
      'badFile',
      'tooMany',
      'bothDone',
      'deadTitle',
      'dead',
    ]) {
      expect(english[key], key).toBeTruthy()
    }
  })

  it.each(LOCALES)('%s has every key, filled', (locale) => {
    const messages = upload(locale)
    expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort())
    for (const [key, value] of Object.entries(messages)) expect(value, key).not.toBe('')
  })

  it('is written in Arabic in Arabic', () => {
    for (const value of Object.values(upload('ar'))) expect(value).toMatch(ARABIC)
  })
})
