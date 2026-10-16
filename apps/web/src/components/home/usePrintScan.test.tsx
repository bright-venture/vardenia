// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PRINT_SCAN_DELAYS, usePrintScan } from './usePrintScan'
let observers: Set<FakeObserver>
let visible: boolean
let hidden: boolean
let container: HTMLDivElement
let root: Root
class FakeObserver {
  constructor(private report: (entries: { intersectionRatio: number }[]) => void) {
    observers.add(this)
  }
  update() {
    this.report([{ intersectionRatio: visible ? 0.8 : 0 }])
  }
  observe() {
    this.update()
  }
  disconnect() {
    observers.delete(this)
  }
}
function Probe({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const { phase, replay, reveal } = usePrintScan(ref, enabled)
  return (
    <section ref={ref}>
      <div id="vd-print-page" />
      <output>{phase}</output>
      <button onClick={replay}>Replay</button>
      <button onClick={reveal}>Reveal</button>
    </section>
  )
}
const phase = () => container.querySelector('output')?.textContent
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms))
beforeEach(() => {
  vi.useFakeTimers()
  observers = new Set()
  visible = true
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
describe('print-to-page camera demonstration', () => {
  it('shows aiming, reading, detection and page in order, then stops until replayed', () => {
    act(() => root.render(<Probe />))
    expect(phase()).toBe('0')
    PRINT_SCAN_DELAYS.forEach((delay, index) => {
      tick(delay - 1)
      expect(phase()).toBe(String(index))
      tick(1)
      expect(phase()).toBe(String(index + 1))
    })
    tick(60000)
    expect(phase()).toBe('3')
    expect(vi.getTimerCount()).toBe(0)
    act(() => container.querySelector('button')!.click())
    expect(phase()).toBe('0')
    tick(PRINT_SCAN_DELAYS[0])
    expect(phase()).toBe('1')
  })
  it('waits offscreen and pauses when the tab is hidden', () => {
    visible = false
    act(() => root.render(<Probe />))
    tick(60000)
    expect(phase()).toBe('0')
    visible = true
    act(() => observers.forEach((observer) => observer.update()))
    tick(PRINT_SCAN_DELAYS[0])
    expect(phase()).toBe('1')
    hidden = true
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    tick(60000)
    expect(phase()).toBe('1')
    hidden = false
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    tick(PRINT_SCAN_DELAYS[1])
    expect(phase()).toBe('2')
  })
  it('shows a usable final page with motion off and lets keyboard focus skip the demonstration', () => {
    act(() => root.render(<Probe enabled={false} />))
    expect(phase()).toBe('3')
    expect(vi.getTimerCount()).toBe(0)
    act(() => root.render(<Probe />))
    tick(PRINT_SCAN_DELAYS[0])
    expect(phase()).toBe('1')
    act(() => container.querySelectorAll('button')[1]!.click())
    expect(phase()).toBe('3')
    expect(vi.getTimerCount()).toBe(0)
  })
})
