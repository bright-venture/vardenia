// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
import type { MagazineData } from '../magazine/types'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const magazine = vi.hoisted(() => ({ data: null as MagazineData | null }))
vi.mock('../magazine/use-magazine', () => ({
  useMagazine: () => ({
    data: magazine.data,
    error: null,
    gone: false,
    loading: false,
    retry: () => {},
  }),
}))

const { IssuePagePreview } = await import('./IssuePagePreview')

/** Page 2-3 is a full spread holding number 1; page 4 a full page holding 2. */
const DATA: MagazineData = {
  issue: { id: 1, title: 'All Lebanon' },
  pages: [
    { page: 1, kind: 'editorial', note: null },
    {
      page: 2,
      kind: 'listings',
      layout: 'full-spread',
      span: 2,
      slots: [{ number: 1, position: null }],
    },
    {
      page: 4,
      kind: 'listings',
      layout: 'full-page',
      span: 1,
      slots: [{ number: 2, position: null }],
    },
  ],
  regions: [{ governorate: 'keserwan', firstPage: 2, lastPage: 4 }],
  businesses: [],
}

let host: HTMLDivElement
let root: Root

const mount = (number: number, locale: Locale = 'en') =>
  act(() =>
    root.render(
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
        <IssuePagePreview issueId={1} number={number} draft={null} locale={locale} />
      </NextIntlClientProvider>,
    ),
  )
const buttons = () =>
  [...host.querySelectorAll('[data-spread-preview] button')] as HTMLButtonElement[]
const side = () => host.querySelector('[data-side]')?.getAttribute('data-side')
const shift = () => (host.querySelector('[data-side]') as HTMLElement | null)?.style.transform

beforeEach(() => {
  magazine.data = DATA
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('IssuePagePreview', () => {
  it('shows a full spread one page at a time, starting on its first page', async () => {
    await mount(1)
    expect(buttons().map((b) => b.textContent)).toEqual(['Page 2', 'Page 3'])
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    expect(side()).toBe('0')
    expect(shift()).toBe('translateX(0%)')
  })

  it('switches to the second page of the spread', async () => {
    await mount(1)
    act(() => buttons()[1]!.click())
    expect(side()).toBe('1')
    expect(shift()).toBe('translateX(-50%)')
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
  })

  it('starts the spread on its right-hand half in Arabic, where the first page sits', async () => {
    await mount(1, 'ar')
    expect(shift()).toBe('translateX(-50%)')
  })

  it('shows a single page whole, with no switch', async () => {
    await mount(2)
    expect(host.querySelector('[data-spread-preview]')).toBeNull()
    expect(host.querySelector('[data-page="4"]')).not.toBeNull()
  })
})
