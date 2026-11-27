// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
// These tests are about the drawn pages; the printed-page mode for an All
// Lebanon issue (page-images) is switched on only where a test asks for it.
const printed = vi.hoisted(() => ({ on: false }))
vi.mock('./page-images', async (importOriginal) => {
  const real = await importOriginal<typeof import('./page-images')>()
  // Which issues match the PDF is tested in page-images.test; here the
  // viewer only has to draw the images when it is told to.
  return { ...real, pageImagesFor: () => (printed.on ? real.allLebanonPage : null) }
})

import { MagazineViewer } from './MagazineViewer'
import { useMagazine } from './use-magazine'
import type { MagazineBusiness, MagazineData } from './types'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const biz = (number: number, name: string): MagazineBusiness => ({
  number,
  name,
  tagline: '',
  category: 'cafe',
  governorate: 'beirut',
  address: '',
  hours: '',
  phone: '',
  description: '',
  photoUrl: null,
})

const full = (page: number, number: number): MagazineData['pages'][number] => ({
  page,
  kind: 'listings',
  layout: 'full-page',
  span: 1,
  slots: [{ number, position: 1 }],
})

/** Pages 1..6: 1 editorial, 2-5 full pages numbered 1-4, 6 editorial. */
const base = (businesses: MagazineBusiness[]): MagazineData => ({
  issue: { id: 7, title: 'Summer 2026' },
  pages: [
    { page: 1, kind: 'editorial', note: 'Cover note' },
    full(2, 1),
    full(3, 2),
    full(4, 3),
    full(5, 4),
    { page: 6, kind: 'editorial', note: null },
  ],
  // beirut repeated per city block: must show once in the menu.
  regions: [
    { governorate: 'beirut', firstPage: 2, lastPage: 3 },
    { governorate: 'beirut', firstPage: 4, lastPage: 4 },
    { governorate: 'metn', firstPage: 5, lastPage: 5 },
  ],
  businesses,
})

const ok = (data: MagazineData) =>
  ({ ok: true, json: async () => ({ ok: true, ...data }) }) as unknown as Response

let host: HTMLElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  host = document.createElement('div')
  document.body.append(host)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function mount(props: { highlight?: number | null; locale?: Locale; issueId?: number } = {}) {
  const locale = props.locale ?? 'en'
  root = createRoot(host)
  act(() =>
    root.render(
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
        <MagazineViewer
          issueId={props.issueId ?? 7}
          locale={locale}
          highlight={props.highlight ?? null}
        />
      </NextIntlClientProvider>,
    ),
  )
  await flush()
}

const shownPages = () =>
  [...host.querySelectorAll('[data-page]')].map((n) => Number(n.getAttribute('data-page')))
const click = (el: Element | null) => act(() => (el as HTMLElement).click())
const button = (label: string) => host.querySelector(`button[aria-label="${label}"]`)
const key = (k: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })

describe('MagazineViewer', () => {
  it('shows the first spread (page 1 alone) after the first load', async () => {
    fetchMock.mockResolvedValue(ok(base([])))
    await mount()
    expect(shownPages()).toEqual([1])
    expect(host.textContent).toContain('Summer 2026')
    expect(host.textContent).toContain('Cover note')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/place-submissions/magazine?issue=7&locale=en')
  })

  it('turns spreads with the buttons and ends at the last one', async () => {
    fetchMock.mockResolvedValue(ok(base([])))
    await mount()
    click(button('Next pages'))
    expect(shownPages()).toEqual([2, 3])
    click(button('Next pages'))
    click(button('Next pages'))
    expect(shownPages()).toEqual([6])
    expect(button('Next pages')?.getAttribute('aria-disabled')).toBe('true')
    // still a real, focusable button: focus is not lost at the end
    ;(button('Next pages') as HTMLButtonElement).focus()
    expect(document.activeElement).toBe(button('Next pages'))
    click(button('Next pages'))
    expect(shownPages()).toEqual([6])
    click(button('Previous pages'))
    expect(shownPages()).toEqual([4, 5])
  })

  it('turns spreads with the arrow keys; RTL reverses them', async () => {
    fetchMock.mockResolvedValue(ok(base([])))
    await mount()
    key('ArrowRight')
    expect(shownPages()).toEqual([2, 3])
    key('ArrowLeft')
    expect(shownPages()).toEqual([1])
    act(() => root.unmount())
    host.replaceChildren()
    await mount({ locale: 'ar' })
    expect(host.querySelector('section')?.getAttribute('dir')).toBe('rtl')
    key('ArrowLeft')
    expect(shownPages()).toEqual([2, 3])
    key('ArrowRight')
    expect(shownPages()).toEqual([1])
  })

  it('lists each governorate once and jumps to its first page', async () => {
    fetchMock.mockResolvedValue(ok(base([])))
    await mount()
    const select = host.querySelector('select') as HTMLSelectElement
    expect([...select.options].map((o) => o.value).filter(Boolean)).toEqual(['beirut', 'metn'])
    act(() => {
      select.value = 'metn'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(shownPages()).toEqual([4, 5])
  })

  it('jumps back to the start of the region already shown', async () => {
    fetchMock.mockResolvedValue(ok(base([])))
    await mount({ highlight: 4 })
    expect(shownPages()).toEqual([4, 5])
    const select = host.querySelector('select') as HTMLSelectElement
    act(() => {
      select.value = 'beirut'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(shownPages()).toEqual([2, 3])
  })

  it('jumps to a typed page and ignores an out-of-range one', async () => {
    fetchMock.mockResolvedValue(ok(base([])))
    await mount()
    const input = host.querySelector('input') as HTMLInputElement
    const set = (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      act(() => {
        setter?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      act(() => {
        host
          .querySelector('form')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
    }
    set('5')
    expect(shownPages()).toEqual([4, 5])
    set('99')
    expect(shownPages()).toEqual([4, 5])
  })

  it('opens on the page of the highlighted number and marks it', async () => {
    fetchMock.mockResolvedValue(ok(base([biz(3, 'Mine')])))
    await mount({ highlight: 3 })
    expect(shownPages()).toEqual([4, 5])
    expect(host.querySelectorAll('[data-you]')).toHaveLength(1)
    expect(host.textContent).toContain('Mine')
  })

  it('shows the printed pages for an All Lebanon issue, with reserved slots named', async () => {
    printed.on = true
    try {
      fetchMock.mockResolvedValue(ok(base([biz(3, 'Mine')])))
      await mount({ highlight: 3 })
      const imgs = [...host.querySelectorAll('img')].map((i) => i.getAttribute('src'))
      expect(imgs).toEqual([
        '/magazine-pages/all-lebanon/004.webp',
        '/magazine-pages/all-lebanon/005.webp',
      ])
      expect(host.querySelectorAll('[data-printed]')).toHaveLength(2)
      expect(host.textContent).toContain('You')
    } finally {
      printed.on = false
    }
  })

  it('opens on the first spread when the number is not in the issue', async () => {
    fetchMock.mockResolvedValue(ok(base([])))
    await mount({ highlight: 99 })
    expect(shownPages()).toEqual([1])
  })

  it('shows one page at a time on a narrow screen', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    fetchMock.mockResolvedValue(ok(base([])))
    await mount({ highlight: 3 })
    expect(shownPages()).toEqual([4])
    click(button('Next pages'))
    expect(shownPages()).toEqual([5])
  })

  it('shows an error with a retry when nothing loads', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) })
    await mount()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('We could not load')
    fetchMock.mockResolvedValue(ok(base([])))
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Try again')
    click(retry ?? null)
    await flush()
    expect(shownPages()).toEqual([1])
  })
})

describe('MagazineViewer unavailable issue', () => {
  it.each([404, 409])('a %s says it is not available and stops polling', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ ok: false }) })
    await mount()
    expect(host.textContent).toContain('not available')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    await flush(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a 500 keeps the retry and keeps polling', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ ok: false }) })
    await mount()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    await flush(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('useMagazine polling', () => {
  function Probe({ id }: { id: number | null }) {
    const { data, error, loading } = useMagazine(id, 'en')
    return (
      <p data-probe>
        {loading
          ? 'loading'
          : error
            ? 'error'
            : (data?.businesses.map((b) => b.name).join(',') ?? '')}
      </p>
    )
  }
  const probe = async (id: number | null = 7) => {
    root = createRoot(host)
    act(() => root.render(<Probe id={id} />))
    await flush()
  }
  const text = () => host.querySelector('[data-probe]')?.textContent

  it('refetches on the interval and shows a newly reserved business', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(base([])))
      .mockResolvedValueOnce(ok(base([biz(1, 'New Cafe')])))
    await probe()
    expect(text()).toBe('')
    await flush(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(text()).toBe('New Cafe')
  })

  it('does not start a second request while one is pending', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    await probe()
    await flush(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not poll while the tab is hidden, and asks again when it returns', async () => {
    fetchMock.mockResolvedValue(ok(base([])))
    await probe()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await flush(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the old view when a later poll fails', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(base([biz(1, 'Kept')])))
      .mockRejectedValueOnce(new Error('offline'))
    await probe()
    await flush(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(text()).toBe('Kept')
  })

  it('reports an error only when nothing has loaded', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    await probe()
    expect(text()).toBe('error')
  })

  it('aborts the pending request on unmount and asks nothing for no issue', async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal
      return new Promise(() => {})
    })
    await probe()
    act(() => root.unmount())
    expect(signal?.aborted).toBe(true)
    root = createRoot(host)
    fetchMock.mockClear()
    act(() => root.render(<Probe id={null} />))
    await flush(60_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
