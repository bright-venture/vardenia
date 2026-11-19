// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
import { NumberPicker } from './NumberPicker'
import type { NumbersIssue } from './use-place-numbers'

const keserwan: NumbersIssue = {
  issueId: 1,
  issueTitle: 'All Lebanon',
  from: 1,
  to: 90,
  taken: [3],
}

const render = (
  issues: NumbersIssue[],
  value: number | null = null,
  locale: Locale = 'en',
  selectedIssue: number | null = null,
) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Beirut">
      <NumberPicker
        issues={issues}
        value={value}
        selectedIssue={selectedIssue}
        onChange={() => {}}
      />
    </NextIntlClientProvider>,
  )

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html')

const en = getMessages('en').magazinePlaces.numbers

describe('NumberPicker', () => {
  it('shows every number from 1 to 90, as buttons', () => {
    const buttons = [...doc(render([keserwan])).querySelectorAll('button')]
    expect(buttons).toHaveLength(90)
    expect(buttons[0]!.textContent).toContain('1')
    expect(buttons[89]!.textContent).toContain('90')
    expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true)
  })

  it('disables a taken number and labels it, visibly and for screen readers', () => {
    const buttons = [...doc(render([keserwan])).querySelectorAll('button')]
    const three = buttons[2]!
    expect(three.hasAttribute('disabled')).toBe(true)
    expect(three.textContent).toContain(en.taken)
    expect(three.getAttribute('aria-label')).toBe('Number 3, taken')
    const four = buttons[3]!
    expect(four.hasAttribute('disabled')).toBe(false)
    expect(four.getAttribute('aria-label')).toBe('Number 4')
    expect(four.textContent).not.toContain(en.taken)
  })

  it('marks the chosen number as pressed', () => {
    const buttons = [...doc(render([keserwan], 47, 'en', 1)).querySelectorAll('button')]
    expect(buttons[46]!.getAttribute('aria-pressed')).toBe('true')
    expect(buttons[45]!.getAttribute('aria-pressed')).toBe('false')
  })

  it('says how many are free', () => {
    expect(doc(render([keserwan])).body.textContent).toContain('89 of 90 free')
  })

  it('says so when every number is taken, and offers no button', () => {
    const full = { ...keserwan, from: 1, to: 3, taken: [1, 2, 3] }
    const html = render([full])
    expect(doc(html).body.textContent).toContain(en.noneFree)
    expect(doc(html).querySelectorAll('button:not([disabled])')).toHaveLength(0)
  })

  it('says so when the region has no block of numbers', () => {
    const html = render([])
    expect(doc(html).body.textContent).toContain(en.noRange)
    expect(doc(html).querySelectorAll('button')).toHaveLength(0)
  })

  it('reads in Arabic', () => {
    const ar = getMessages('ar').magazinePlaces.numbers
    const html = render([keserwan], null, 'ar')
    expect(doc(html).body.textContent).toContain(ar.taken)
  })
})
