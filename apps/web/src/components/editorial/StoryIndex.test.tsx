// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StoryIndex } from './StoryIndex'

let container: HTMLDivElement
let root: Root
let targets: HTMLDivElement
const sections = [
  { id: 'story-0', heading: 'First question' },
  { id: 'story-1', heading: 'السؤال الثاني' },
]
const render = () => act(() => root.render(<StoryIndex title="Questions" sections={sections} />))

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('IntersectionObserver', undefined)
  window.history.replaceState(null, '', '/faq')
  container = document.createElement('div')
  targets = document.createElement('div')
  targets.innerHTML =
    '<details id="story-0"><summary>First question</summary><p>First answer</p></details><details id="story-1"><summary>السؤال الثاني</summary><p>الجواب</p></details>'
  document.body.append(container, targets)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  targets.remove()
  vi.unstubAllGlobals()
})

describe('standing-page reading index', () => {
  it('keeps native fragment links, translated headings and decorative ordinals', () => {
    render()
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Questions')
    const links = container.querySelectorAll('a')
    expect(links[1]!.getAttribute('href')).toBe('#story-1')
    expect(links[1]!.textContent).toContain('السؤال الثاني')
    expect(links[1]!.querySelector('.vd-reading-number')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('[aria-current="location"]')).toHaveLength(1)
  })

  it('opens the selected answer and moves keyboard focus to its summary', () => {
    render()
    act(() =>
      container.querySelectorAll('a')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    )
    expect((targets.querySelector('#story-1') as HTMLDetailsElement).open).toBe(true)
    expect(document.activeElement).toBe(targets.querySelector('#story-1 summary'))
    expect(container.querySelector('[aria-current="location"]')?.getAttribute('href')).toBe(
      '#story-1',
    )
  })

  it('opens a directly linked answer and follows later hash navigation', () => {
    window.history.replaceState(null, '', '#story-1')
    render()
    expect((targets.querySelector('#story-1') as HTMLDetailsElement).open).toBe(true)
    act(() => {
      window.history.replaceState(null, '', '#story-0')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect((targets.querySelector('#story-0') as HTMLDetailsElement).open).toBe(true)
    expect(container.querySelector('[aria-current="location"]')?.getAttribute('href')).toBe(
      '#story-0',
    )
  })

  it('ignores unrelated fragments without opening arbitrary disclosures', () => {
    window.history.replaceState(null, '', '#other')
    render()
    expect(targets.querySelectorAll('details[open]')).toHaveLength(0)
  })
  it('updates the reading cue on scroll and disconnects its observer', () => {
    let report: IntersectionObserverCallback = () => undefined
    const disconnect = vi.fn()
    const observe = vi.fn()
    class Observer {
      constructor(callback: IntersectionObserverCallback) {
        report = callback
      }
      observe = observe
      disconnect = disconnect
    }
    vi.stubGlobal('IntersectionObserver', Observer)
    render()
    expect(observe).toHaveBeenCalledTimes(2)
    const entry = (id: string, isIntersecting: boolean) =>
      ({ target: targets.querySelector(`#${id}`)!, isIntersecting }) as IntersectionObserverEntry
    act(() => report([entry('story-0', true), entry('story-1', true)], {} as IntersectionObserver))
    expect(container.querySelector('[aria-current="location"]')?.getAttribute('href')).toBe(
      '#story-0',
    )
    // B remains visible and therefore is omitted from this change-only callback.
    act(() => report([entry('story-0', false)], {} as IntersectionObserver))
    expect(container.querySelector('[aria-current="location"]')?.getAttribute('href')).toBe(
      '#story-1',
    )
    act(() => root.render(null))
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
  it.each([
    [1440, 900],
    [1180, 747],
    [375, 667],
    [800, 100],
  ])('keeps a positive height-based reading band at %i × %i', (width, height) => {
    vi.stubGlobal('innerWidth', width)
    vi.stubGlobal('innerHeight', height)
    const construct = vi.fn()
    class Observer {
      constructor(_callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
        construct(options)
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', Observer)
    render()
    const margin = construct.mock.calls[0]![0].rootMargin as string
    expect(margin).not.toContain('%')
    const [top, , bottom] = margin.split(' ').map(parseFloat)
    expect(height + top! + bottom!).toBeGreaterThan(0)
    expect(bottom).toBe(
      -Math.min(Math.round(height * 0.55), height - Math.min(120, height - 1) - 1),
    )
  })

  it('rebuilds the reading band on resize and ignores stale geometry callbacks', () => {
    const instances: {
      report: IntersectionObserverCallback
      disconnect: ReturnType<typeof vi.fn>
      observe: ReturnType<typeof vi.fn>
      options: IntersectionObserverInit
    }[] = []
    class Observer {
      disconnect = vi.fn()
      observe = vi.fn()
      constructor(report: IntersectionObserverCallback, options: IntersectionObserverInit) {
        instances.push({ report, options, disconnect: this.disconnect, observe: this.observe })
      }
    }
    vi.stubGlobal('IntersectionObserver', Observer)
    vi.stubGlobal('innerHeight', 900)
    render()
    const entry = (id: string) =>
      ({
        target: targets.querySelector(`#${id}`)!,
        isIntersecting: true,
      }) as IntersectionObserverEntry
    act(() => instances[0]!.report([entry('story-0')], {} as IntersectionObserver))
    vi.stubGlobal('innerHeight', 600)
    act(() => window.dispatchEvent(new Event('resize')))
    expect(instances[0]!.disconnect).toHaveBeenCalledOnce()
    expect(instances[1]!.options.rootMargin).toBe('-120px 0px -330px 0px')
    expect(instances[1]!.observe).toHaveBeenCalledTimes(2)
    act(() => instances[1]!.report([entry('story-1')], {} as IntersectionObserver))
    act(() => instances[0]!.report([entry('story-0')], {} as IntersectionObserver))
    expect(container.querySelector('[aria-current="location"]')?.getAttribute('href')).toBe(
      '#story-1',
    )
    act(() => root.render(null))
    expect(instances[1]!.disconnect).toHaveBeenCalledOnce()
    act(() => window.dispatchEvent(new Event('resize')))
    expect(instances).toHaveLength(2)
  })
  for (const navigation of ['click', 'hash'] as const) {
    it(`keeps the requested answer current through ${navigation} scrolling, then resumes reading cues`, () => {
      let report: IntersectionObserverCallback = () => undefined
      class Observer {
        constructor(callback: IntersectionObserverCallback) {
          report = callback
        }
        observe() {}
        disconnect() {}
      }
      vi.stubGlobal('IntersectionObserver', Observer)
      render()
      const entry = (id: string, isIntersecting: boolean) =>
        ({ target: targets.querySelector(`#${id}`)!, isIntersecting }) as IntersectionObserverEntry
      const emit = (...entries: IntersectionObserverEntry[]) =>
        act(() => report(entries, {} as IntersectionObserver))
      const current = () =>
        container.querySelector('[aria-current="location"]')?.getAttribute('href')
      const select = () =>
        act(() => {
          if (navigation === 'click') container.querySelectorAll('a')[1]!.click()
          else {
            window.history.replaceState(null, '', '#story-1')
            window.dispatchEvent(new HashChangeEvent('hashchange'))
          }
        })
      emit(entry('story-0', true))
      select()
      expect(current()).toBe('#story-1')
      // Older callbacks and the preceding question still visible must not
      // undo an explicit jump to question 8 merely because question 7 is first.
      emit(entry('story-0', true))
      expect(current()).toBe('#story-1')
      emit(entry('story-1', true))
      expect(current()).toBe('#story-1')
      expect((targets.querySelector('#story-1') as HTMLDetailsElement).open).toBe(true)
      act(() => window.dispatchEvent(new WheelEvent('wheel', { deltaX: 100 })))
      expect(current()).toBe('#story-1')
      act(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 })))
      expect(current()).toBe('#story-0')
      // Scrollbar/programmatic departure also releases the preference once
      // the target has actually entered, then exited, the reading band.
      select()
      emit(entry('story-1', true))
      emit(entry('story-1', false))
      expect(current()).toBe('#story-0')
    })
  }
})
