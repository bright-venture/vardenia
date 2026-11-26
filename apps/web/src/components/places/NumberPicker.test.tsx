// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
import { NumberPicker } from './NumberPicker'
import type { LayoutIssue } from './use-place-numbers'

const summer: LayoutIssue = {
  issueId: 1,
  issueTitle: 'All Lebanon',
  currency: 'USD',
  price: 300,
  downpaymentAmount: 150,
  slots: [
    { number: 5, page: 62, position: 3, lastPage: 62 },
    { number: 6, page: 12, position: null, lastPage: 12 },
    { number: 7, page: 62, position: null, lastPage: 63 },
  ],
}

const render = (
  issues: LayoutIssue[],
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
  it('lists each free slot as text, one button each, carrying its listing number', () => {
    const buttons = [...doc(render([summer])).querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Page 62, position 3',
      'Page 12',
      'Pages 62-63',
    ])
    expect(buttons.map((b) => b.getAttribute('data-number'))).toEqual(['5', '6', '7'])
    expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true)
  })

  it('marks the chosen slot as pressed', () => {
    const buttons = [...doc(render([summer], 6, 'en', 1)).querySelectorAll('button')]
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true')
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('false')
  })

  it("puts the layout's price and the free count in the issue heading", () => {
    const text = doc(render([summer])).body.textContent ?? ''
    expect(text).toContain('All Lebanon')
    expect(text).toContain('$300 per year')
    expect(text).toContain('3 free')
  })

  it('says so when every slot of the layout is taken, and offers no button', () => {
    const html = render([{ ...summer, slots: [] }])
    expect(doc(html).body.textContent).toContain(en.noneFree)
    expect(doc(html).querySelectorAll('button')).toHaveLength(0)
  })

  it('says so when no issue offers the layout in this region', () => {
    const html = render([])
    expect(doc(html).body.textContent).toContain(en.noneForLayout)
    expect(doc(html).querySelectorAll('button')).toHaveLength(0)
  })

  it('reads in Arabic, with no raw key', () => {
    const ar = getMessages('ar').magazinePlaces.numbers
    const text = doc(render([summer], null, 'ar')).body.textContent ?? ''
    expect(text).toContain(ar.slotPage.split('{')[0]!.trim())
    expect(text).not.toMatch(/numbers\.|\{/)
  })
})
