// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { MagazineReader } from './MagazineReader'
const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  destroy: vi.fn(),
  getPage: vi.fn(),
  width: 1000,
  height: 520,
  reduceMotion: false,
}))
vi.mock('./load-pdfjs', () => ({
  PDFJS_ASSET_BASE: '/pdfjs-assets/test-version',
  loadPdfJs: async () => ({ getDocument: mocks.getDocument }),
}))
let host: HTMLDivElement
let root: Root
let resize: (entries: unknown[]) => void
const props = {
  src: '/read/issue/test',
  originalSrc: '/original.pdf',
  title: 'Test edition',
  locale: 'en',
}
const button = (label: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  )!
const visiblePages = () => host.querySelectorAll('canvas[data-reader-page]')
async function click(label: string) {
  await act(async () => button(label).click())
}
async function finishTurn() {
  await act(async () => {
    vi.advanceTimersByTime(1250)
  })
}
async function next() {
  await click('Next')
  await finishTurn()
}
async function pointer(
  type: string,
  x: number,
  y = 400,
  target: Element = host.querySelector('[tabindex="0"]')!,
) {
  await act(async () => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    })
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'mouse' },
      isPrimary: { value: true },
    })
    target.dispatchEvent(event)
  })
}
function measureBook() {
  vi.spyOn(host.querySelector('[data-reader-book]')!, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 390,
    bottom: 520,
    width: 390,
    height: 520,
    toJSON() {},
  })
}
async function open() {
  await act(async () => root.render(<MagazineReader {...props} />))
  await click('Open reader')
}
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.width = 1000
  mocks.height = 520
  mocks.reduceMotion = false
  mocks.getPage.mockImplementation(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent: async () => ({ items: [{ str: 'Accessible page text', hasEOL: true }] }),
  }))
  mocks.getDocument.mockImplementation(() => ({
    promise: Promise.resolve({ numPages: 6, getPage: mocks.getPage }),
    destroy: mocks.destroy,
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: (entries: unknown[]) => void) {}
      observe() {
        resize = this.callback
        this.callback([{ contentRect: { width: mocks.width, height: mocks.height } }])
      }
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: mocks.reduceMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
  Element.prototype.scrollTo = vi.fn()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('built-in magazine reader', () => {
  it('keeps the original PDF available and does not fetch the issue until requested', async () => {
    await act(async () => root.render(<MagazineReader {...props} />))
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/original.pdf')
    expect(mocks.getDocument).not.toHaveBeenCalled()
    await click('Open reader')
    expect(mocks.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/read/issue/test',
        isEvalSupported: false,
        disableRange: false,
        disableStream: true,
        disableAutoFetch: true,
        rangeChunkSize: 1024 * 1024,
      }),
    )
    expect(visiblePages()).toHaveLength(1)
    expect(document.activeElement).toBe(host.querySelector('[tabindex="0"]'))
    expect(parseFloat((visiblePages()[0] as HTMLCanvasElement).style.height)).toBeLessThanOrEqual(
      mocks.height,
    )
    await click('Read page text')
    expect(host.querySelector('#magazine-reader-text')?.textContent).toContain(
      'Accessible page text',
    )
  })
  it('uses desktop spreads and keeps a directional paper layer until the turn finishes', async () => {
    await open()
    await click('Next')
    expect(visiblePages()).toHaveLength(2)
    expect(host.textContent).toContain('Page 2–3 / 6')
    expect(host.querySelector('[data-reader-turn]')?.getAttribute('data-reader-turn')).toBe(
      'turning',
    )
    expect(button('Next').disabled).toBe(true)
    await finishTurn()
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    await next()
    expect(host.textContent).toContain('Page 4–5 / 6')
    await click('Previous')
    await finishTurn()
    expect(host.textContent).toContain('Page 2–3 / 6')
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Zoom"]')!
    await act(async () => {
      select.value = '2'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(parseFloat((visiblePages()[0] as HTMLCanvasElement).style.width)).toBe(780)
    expect(parseFloat((visiblePages()[0] as HTMLCanvasElement).style.height)).toBe(1040)
  })
  it('waits for destination renders instead of flipping into an empty spread and ignores repeated turns', async () => {
    await open()
    let resolve!: () => void
    const pending = new Promise<void>((done) => {
      resolve = done
    })
    const normal = mocks.getPage.getMockImplementation()!
    mocks.getPage.mockImplementation(async () => ({
      ...(await normal()),
      render: () => ({ promise: pending, cancel: vi.fn() }),
    }))
    await click('Next')
    expect(host.querySelector('[data-reader-turn]')?.getAttribute('data-reader-turn')).toBe(
      'waiting',
    )
    await click('Next')
    expect(host.textContent).toContain('Page 1 / 6')
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('1')
    await act(async () => resolve())
    expect(host.textContent).toContain('Page 2–3 / 6')
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('2')
    expect(host.querySelector('[data-reader-turn]')?.getAttribute('data-reader-turn')).toBe(
      'turning',
    )
    await finishTurn()
    expect(button('Next').disabled).toBe(false)
  })
  it('can jump to the end while a page turn is pending and releases its temporary layer', async () => {
    await open()
    await click('Next')
    const viewport = host.querySelector('[tabindex="0"]')!
    await act(async () =>
      viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })),
    )
    expect(host.textContent).toContain('Page 6 / 6')
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    expect(button('Next').disabled).toBe(true)
  })
  it('lets the reader drag a curved paper surface and release to complete the turn', async () => {
    await open()
    measureBook()
    await pointer('pointerdown', 350, 400, visiblePages()[0]!)
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await pointer('pointermove', 80)
    expect(host.querySelector('[data-reader-turn]')?.getAttribute('data-reader-turn')).toBe(
      'dragging',
    )
    expect(host.querySelectorAll('[data-paper-strip]')).toHaveLength(28)
    expect(
      Number(host.querySelector('[data-paper-progress]')?.getAttribute('data-paper-progress')),
    ).toBeGreaterThan(0.4)
    expect(host.textContent).toContain('Page 1 / 6')
    await pointer('pointerup', 80)
    expect(host.querySelector('[data-reader-turn]')?.getAttribute('data-reader-turn')).toBe(
      'turning',
    )
    await finishTurn()
    expect(host.textContent).toContain('Page 2–3 / 6')
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
  })
  it('returns a short paper drag to the same page without leaving an overlay or loading lock', async () => {
    await open()
    measureBook()
    await pointer('pointerdown', 350, 400, visiblePages()[0]!)
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await pointer('pointermove', 325)
    await pointer('pointerup', 325)
    expect(host.querySelector('[data-reader-turn]')?.getAttribute('data-reader-turn')).toBe(
      'returning',
    )
    await finishTurn()
    expect(host.textContent).toContain('Page 1 / 6')
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    expect(button('Next').disabled).toBe(false)
  })
  it('cancels interrupted drags and leaves vertical scrolling alone', async () => {
    await open()
    measureBook()
    await pointer('pointerdown', 350, 400, visiblePages()[0]!)
    await pointer('pointermove', 345, 520)
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    await pointer('pointerdown', 350, 400, visiblePages()[0]!)
    await pointer('pointermove', 100)
    await pointer('pointercancel', 100)
    await finishTurn()
    expect(host.textContent).toContain('Page 1 / 6')
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
  })
  it('limits the initial curl until the requested destination is rendered', async () => {
    await open()
    measureBook()
    const normal = mocks.getPage.getMockImplementation()!
    let resolve!: () => void
    const pending = new Promise<void>((done) => {
      resolve = done
    })
    mocks.getPage.mockImplementation(async () => ({
      ...(await normal()),
      render: () => ({ promise: pending, cancel: vi.fn() }),
    }))
    await pointer('pointerdown', 350, 400, visiblePages()[0]!)
    await pointer('pointermove', 80)
    expect(
      Number(host.querySelector('[data-paper-progress]')?.getAttribute('data-paper-progress')),
    ).toBeLessThanOrEqual(0.1)
    await act(async () => resolve())
    expect(
      Number(host.querySelector('[data-paper-progress]')?.getAttribute('data-paper-progress')),
    ).toBeGreaterThan(0.4)
    await pointer('pointerup', 80)
    await finishTurn()
    expect(host.textContent).toContain('Page 2–3 / 6')
  })
  it('uses a modal for expanded reading and restores the launcher and body scroll on Escape', async () => {
    document.body.style.overflow = 'auto'
    await open()
    await click('Expand reader')
    expect(host.querySelector('dialog[open]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () =>
      host
        .querySelector('dialog')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(host.querySelector('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.activeElement).toBe(button('Expand reader'))
    await click('Expand reader')
    await click('Close expanded reader')
    expect(host.querySelector('dialog')).toBeNull()
  })
  it('uses one page on narrow screens and supports arrow, Home and End keys', async () => {
    mocks.width = 390
    await open()
    await next()
    expect(visiblePages()).toHaveLength(1)
    expect(host.textContent).toContain('Page 2 / 6')
    const viewport = host.querySelector('[tabindex="0"]')!
    await act(async () =>
      viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    )
    await finishTurn()
    expect(host.textContent).toContain('Page 3 / 6')
    await act(async () =>
      viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })),
    )
    expect(host.textContent).toContain('Page 6 / 6')
    expect(button('Next').disabled).toBe(true)
    await act(async () =>
      viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })),
    )
    expect(button('Previous').disabled).toBe(true)
  })
  it('honors reduced motion without leaving navigation locked', async () => {
    mocks.reduceMotion = true
    await open()
    await click('Next')
    expect(host.textContent).toContain('Page 2–3 / 6')
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    expect(button('Next').disabled).toBe(false)
    await click('Next')
    expect(host.textContent).toContain('Page 4–5 / 6')
  })
  it('honors the persisted site Motion off switch, not only the OS preference', async () => {
    localStorage.setItem('vardenia-motion', 'off')
    await open()
    await click('Next')
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    expect(host.querySelector('[data-reader-motion]')?.getAttribute('data-reader-motion')).toBe(
      'off',
    )
    expect(host.textContent).toContain('Page 2–3 / 6')
    expect(button('Next').disabled).toBe(false)
  })
  it('cancels an active paper turn when the shared site motion preference changes', async () => {
    await open()
    await click('Next')
    expect(host.querySelector('[data-reader-turn]')).not.toBeNull()
    await act(async () => {
      localStorage.setItem('vardenia-motion', 'off')
      window.dispatchEvent(new Event('vardenia:motion'))
    })
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    expect(button('Next').disabled).toBe(false)
    await click('Next')
    expect(host.textContent).toContain('Page 4–5 / 6')
  })
  it('cancels the paper layer on resize and switches to a single page without losing position', async () => {
    await open()
    await click('Next')
    expect(host.querySelector('[data-reader-turn]')).not.toBeNull()
    await act(async () => resize([{ contentRect: { width: 390, height: 520 } }]))
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    expect(visiblePages()).toHaveLength(1)
    expect(host.textContent).toContain('Page 2 / 6')
    expect(button('Next').disabled).toBe(false)
  })
  it('preserves the visible canvas on zoom and caps high-density raster memory', async () => {
    vi.stubGlobal('devicePixelRatio', 3)
    await open()
    const originalCanvas = visiblePages()[0] as HTMLCanvasElement
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Zoom"]')!
    await act(async () => {
      select.value = '4'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(visiblePages()[0]).toBe(originalCanvas)
    expect(originalCanvas.width * originalCanvas.height).toBeLessThanOrEqual(8_000_000)
    await click('Next')
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
  })
  it('reveals page errors after a failed destination render instead of locking navigation', async () => {
    await open()
    mocks.getPage.mockRejectedValue(new Error('page unavailable'))
    await click('Next')
    await finishTurn()
    expect(host.querySelector('[data-reader-turn]')).toBeNull()
    expect(button('Try again')).toBeTruthy()
    expect(button('Next').disabled).toBe(false)
  })
  it('defaults landscape exports to one PDF page instead of combining two spreads', async () => {
    const normal = mocks.getPage.getMockImplementation()!
    mocks.getPage.mockImplementation(async () => ({
      ...(await normal()),
      getViewport: ({ scale }: { scale: number }) => ({ width: 800 * scale, height: 600 * scale }),
    }))
    await open()
    await next()
    expect(visiblePages()).toHaveLength(1)
    expect(host.textContent).toContain('Page 2 / 6')
  })
  it('retries a failed page without fetching the whole PDF again', async () => {
    const normal = mocks.getPage.getMockImplementation()!
    mocks.getPage.mockRejectedValue(new Error('page unavailable'))
    await open()
    expect(button('Try again')).toBeTruthy()
    mocks.getPage.mockImplementation(normal)
    await click('Try again')
    await click('Read page text')
    expect(host.textContent).toContain('Accessible page text')
    expect(mocks.getDocument).toHaveBeenCalledTimes(1)
  })
  it('offers retry on load failure and releases the document on retry/unmount', async () => {
    mocks.getDocument.mockImplementationOnce(() => ({
      promise: Promise.reject(new Error('unavailable')),
      destroy: mocks.destroy,
    }))
    await open()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    await click('Try again')
    expect(visiblePages()).toHaveLength(1)
    expect(mocks.destroy).toHaveBeenCalled()
  })
})
