// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { FilterSheet } from './FilterSheet'
import type { FilterState } from './ListingFilters'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('../i18n/routing', () => ({ useRouter: () => ({ push }), Link: 'a' }))
let container: HTMLDivElement
let root: Root
const initial: FilterState = {
  subcategory: 'boutique-hotels',
  governorate: 'mount-lebanon',
  district: 'keserwan',
  priceRange: '3',
  amenities: ['wifi'],
  openNow: true,
  bookable: true,
  trip: { date: '2026-12-01', time: '19:00', nights: 2, party: 3 },
}
const click = (button: Element) =>
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const button = (text: string) =>
  [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!
const trigger = () => container.querySelector('button[aria-haspopup="dialog"]')!
const render = (locale: 'en' | 'ar' = 'en', state = initial) =>
  act(() =>
    root.render(
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Beirut">
        <FilterSheet base="/stay" state={state} locale={locale} />
      </NextIntlClientProvider>,
    ),
  )

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  push.mockClear()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false
      this.dispatchEvent(new Event('close'))
    },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('directory filter sheet', () => {
  for (const locale of ['en', 'ar'] as const) {
    it(`clears only sheet facets and retains other selections in ${locale}`, () => {
      render(locale)
      click(trigger())
      click(button(getMessages(locale).filters.clearAll))
      click(button(getMessages(locale).filters.showResults))
      expect(push).toHaveBeenCalledTimes(1)
      const params = new URL(push.mock.calls[0]![0], 'https://example.test').searchParams
      for (const name of ['where', 'district', 'price', 'has']) expect(params.has(name)).toBe(false)
      expect(params.get('filter')).toBe(initial.subcategory)
      expect(params.get('open')).toBe('1')
      expect(params.get('book')).toBe('1')
      expect(params.get('date')).toBe(initial.trip!.date)
      expect(params.get('party')).toBe('3')
      expect(params.get('nights')).toBe('2')
    })
  }

  it('discards unapplied changes, restores trigger focus, and reseeds on reopen', () => {
    render()
    click(trigger())
    click(button(getMessages('en').filters.clearAll))
    click(container.querySelector('button[aria-label="Close filters"]')!)
    expect(push).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger())
    click(trigger())
    click(button(getMessages('en').filters.showResults))
    expect(push.mock.calls[0]![0]).toContain('where=mount-lebanon')
    expect(push.mock.calls[0]![0]).toContain('price=3')
  })

  it('preserves the prior scroll lock when opening and closing', () => {
    document.body.style.overflow = 'clip'
    render()
    expect(document.body.style.overflow).toBe('clip')
    click(trigger())
    expect(document.body.style.overflow).toBe('hidden')
    click(container.querySelector('button[aria-label="Close filters"]')!)
    expect(document.body.style.overflow).toBe('clip')
  })

  it('exposes the dialog relationship and synchronizes native dismissal', () => {
    render()
    const dialog = container.querySelector('dialog')!
    expect(trigger().getAttribute('aria-controls')).toBe(dialog.id)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    click(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    act(() => dialog.close())
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(push).not.toHaveBeenCalled()
  })
  it('dismisses stale pending edits after history changes the applied state', () => {
    render()
    click(trigger())
    click(button(getMessages('en').filters.clearAll))
    const newer: FilterState = {
      ...initial,
      governorate: 'beirut',
      district: undefined,
      priceRange: '2',
      trip: { date: '2026-12-05', time: '18:00', nights: 4, party: 5 },
    }
    render('en', newer)
    expect(container.querySelector('dialog')!.open).toBe(false)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(push).not.toHaveBeenCalled()
    click(trigger())
    click(button(getMessages('en').filters.showResults))
    const params = new URL(push.mock.calls[0]![0], 'https://example.test').searchParams
    expect(params.get('where')).toBe('beirut')
    expect(params.get('price')).toBe('2')
    expect(params.get('date')).toBe('2026-12-05')
    expect(params.get('time')).toBe('18:00')
    expect(params.get('party')).toBe('5')
    expect(params.get('nights')).toBe('4')
    expect(params.get('open')).toBe('1')
    expect(params.get('book')).toBe('1')
  })

  it('keeps pending edits for a rerender with unchanged applied values', () => {
    render()
    click(trigger())
    click(button(getMessages('en').filters.clearAll))
    render('en', { ...initial, amenities: [...initial.amenities] })
    expect(container.querySelector('dialog')!.open).toBe(true)
    click(button(getMessages('en').filters.showResults))
    expect(push.mock.calls[0]![0]).not.toContain('where=')
  })
})
