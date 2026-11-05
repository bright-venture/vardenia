// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ResilientPhoto } from './ResilientPhoto'
import { Plate } from './Plate'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const render = (src = '/media/place.webp') =>
  act(() => root.render(<ResilientPhoto src={src} alt="Courtyard" sizes="50vw" />))
const fail = () => act(() => container.querySelector('img')!.dispatchEvent(new Event('error')))

describe('resilient listing photography', () => {
  it('retains a real photograph and its supplied alternative text while available', () => {
    render()
    expect(container.querySelector('img')?.alt).toBe('Courtyard')
    expect(container.querySelector('img')?.sizes).toBe('50vw')
    expect(container.querySelector('[data-photo-placeholder]')).toBeNull()
  })

  it('replaces failed artwork with the neutral decorative treatment without retry loops', () => {
    render()
    fail()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-photo-placeholder]')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
    render()
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps normal photos lazy and forwards above-the-fold priority', () => {
    render()
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy')
    act(() =>
      root.render(<ResilientPhoto src="/media/priority.webp" alt="" sizes="100vw" priority />),
    )
    expect(container.querySelector('img')?.getAttribute('loading')).not.toBe('lazy')
    expect(container.querySelector('img')?.sizes).toBe('100vw')
  })

  it('preserves a meaningful alternative when gallery artwork fails', () => {
    render()
    fail()
    const fallback = container.querySelector('[role="img"]')!
    expect(fallback.getAttribute('aria-label')).toBe('Courtyard')
    expect(fallback.closest('[aria-hidden="true"]')).toBeNull()
    expect(fallback.querySelector('[data-photo-placeholder]')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('keeps an empty-alt image decorative after failure', () => {
    act(() => root.render(<ResilientPhoto src="/media/place.webp" alt="" sizes="50vw" />))
    fail()
    expect(container.querySelector('[role="img"]')).toBeNull()
    expect(container.querySelector('[data-photo-placeholder]')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('tries a genuinely changed source after a failure', () => {
    render()
    fail()
    render('/media/new-place.webp')
    expect(decodeURIComponent(container.querySelector('img')!.src)).toContain(
      '/media/new-place.webp',
    )
    expect(container.querySelector('[data-photo-placeholder]')).toBeNull()
  })

  it('keeps the same portrait frame on a failed card photo', () => {
    act(() =>
      root.render(<Plate image={{ url: '/media/place.webp' }} ratio="portrait" interactive />),
    )
    const frame = container.querySelector('.vd-plate')!
    const classes = frame.className
    fail()
    expect(container.querySelector('.vd-plate')).toBe(frame)
    expect(frame.className).toBe(classes)
    expect(frame.classList.contains('aspect-[4/5]')).toBe(true)
    expect(frame.querySelector('[data-photo-placeholder]')).not.toBeNull()
  })

  it('keeps missing and known import-placeholder media honest without attempting a fetch', () => {
    for (const image of [null, { url: '/media/import-placeholder.webp' }]) {
      act(() => root.render(<Plate image={image} />))
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('[data-photo-placeholder]')).not.toBeNull()
    }
  })
})
