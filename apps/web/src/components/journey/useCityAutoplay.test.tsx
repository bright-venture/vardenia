// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useCallback, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CITY_SLIDE_DELAY, useCityAutoplay } from './useCityAutoplay'

let observers: Set<FakeObserver>
let inView: boolean
let hidden: boolean
let container: HTMLDivElement
let root: Root
class FakeObserver {
  constructor(private callback: (entries: { intersectionRatio: number }[]) => void) {
    observers.add(this)
  }
  report() {
    this.callback([{ intersectionRatio: inView ? 0.8 : 0 }])
  }
  observe() {
    this.report()
  }
  disconnect() {
    observers.delete(this)
  }
}
function Probe({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const [city, setCity] = useState(0)
  const advance = useCallback(() => setCity((old) => old + 1), [])
  useCityAutoplay(ref, enabled, advance, city)
  return (
    <section ref={ref}>
      <output>{city}</output>
      <button onClick={() => setCity(4)}>Choose a city</button>
    </section>
  )
}
const city = () => container.querySelector('output')?.textContent
const tick = (time = CITY_SLIDE_DELAY) => act(() => vi.advanceTimersByTime(time))
beforeEach(() => {
  vi.useFakeTimers()
  observers = new Set()
  inView = true
  hidden = false
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('visible city autoplay', () => {
  it('advances repeatedly after a full reading interval and restarts after a manual choice', () => {
    act(() => root.render(<Probe />))
    tick(CITY_SLIDE_DELAY - 1)
    expect(city()).toBe('0')
    tick(1)
    expect(city()).toBe('1')
    tick()
    expect(city()).toBe('2')
    tick(4000)
    act(() => container.querySelector('button')!.click())
    tick(CITY_SLIDE_DELAY - 1)
    expect(city()).toBe('4')
    tick(1)
    expect(city()).toBe('5')
  })
  it('does not move offscreen or while the browser tab is hidden', () => {
    inView = false
    act(() => root.render(<Probe />))
    tick(30000)
    expect(city()).toBe('0')
    inView = true
    act(() => observers.forEach((observer) => observer.report()))
    tick(4000)
    hidden = true
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    tick(30000)
    expect(city()).toBe('0')
    hidden = false
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    tick()
    expect(city()).toBe('1')
  })
  it('cancels the pending advance when paused or reduced motion disables autoplay', () => {
    act(() => root.render(<Probe />))
    tick(4000)
    act(() => root.render(<Probe enabled={false} />))
    tick(30000)
    expect(city()).toBe('0')
    expect(vi.getTimerCount()).toBe(0)
    act(() => root.render(<Probe />))
    tick()
    expect(city()).toBe('1')
  })
})
