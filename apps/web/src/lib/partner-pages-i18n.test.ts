import { describe, expect, it } from 'vitest'
import { LOCALES } from '@vardenia/i18n'
import { getMessages } from '@vardenia/i18n/messages'

/**
 * The partner "Listing details" and "Branches" pages (Task 12a) are worded
 * in every locale: the same keys everywhere, the same {placeholders} as the
 * English, and real Arabic in Arabic.
 */

type Tree = Record<string, unknown>

const flat = (tree: unknown, prefix = ''): Record<string, string> =>
  Object.fromEntries(
    Object.entries((tree ?? {}) as Tree).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flat(value, `${prefix}${key}.`)),
    ),
  )

const pick = (messages: Tree): Record<string, string> => ({
  ...flat(messages.partnerDetails, 'partnerDetails.'),
  ...flat(messages.partnerBranches, 'partnerBranches.'),
  'partner.editDetails': String((messages.partner as Tree).editDetails ?? ''),
  'partner.tabBranches': String((messages.partner as Tree).tabBranches ?? ''),
})

/** Any letter of the Arabic block. */
const ARABIC = /[\u0600-\u06FF]/

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()

describe('partner details and branches messages', () => {
  const english = pick(getMessages('en') as unknown as Tree)

  it.each(LOCALES)('%s has every key, filled, with the same placeholders', (locale) => {
    const messages = pick(getMessages(locale) as unknown as Tree)
    expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort())
    for (const [key, value] of Object.entries(messages)) {
      expect(value, key).not.toBe('')
      expect(placeholders(value), key).toEqual(placeholders(english[key]!))
    }
  })

  it('is written in Arabic in Arabic', () => {
    const arabic = pick(getMessages('ar') as unknown as Tree)
    expect(arabic['partnerDetails.title']).toMatch(ARABIC)
    expect(arabic['partnerBranches.success']).toMatch(ARABIC)
    expect(arabic['partner.editDetails']).toMatch(ARABIC)
  })
})
