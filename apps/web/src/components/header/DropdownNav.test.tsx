// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DropdownNav } from './DropdownNav'

const route = vi.hoisted(() => ({ pathname: '/faq' }))
vi.mock('../../i18n/routing', () => ({ usePathname: () => route.pathname }))
let container: HTMLDivElement
let root: Root
const render = () =>
  act(() =>
    root.render(
      <DropdownNav label="Discover" wide>
        <a href="#stay">Stay</a>
        <a href="#directory">Directory</a>
      </DropdownNav>,
    ),
  )
const disclosure = () => container.querySelector('details')!
const summary = () => container.querySelector('summary')!
const open = () => act(() => summary().click())
const pointer = (target: Element, type: string, pointerType = 'mouse') => {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  act(() => target.dispatchEvent(event))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  route.pathname = '/faq'
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('desktop discovery disclosure', () => {
  it('uses native open/close semantics and connects its summary to the panel', () => {
    render()
    expect(disclosure().open).toBe(false)
    const panel = document.getElementById(summary().getAttribute('aria-controls')!)!
    expect(panel.querySelectorAll('a')).toHaveLength(2)
    open()
    expect(disclosure().open).toBe(true)
    open()
    expect(disclosure().open).toBe(false)
  })

  it('dismisses with Escape and returns focus without reopening', () => {
    render()
    open()
    const link = container.querySelector('a')!
    act(() => link.focus())
    act(() =>
      link.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    )
    expect(disclosure().open).toBe(false)
    expect(document.activeElement).toBe(summary())
  })

  it('closes on outside pointer input without trapping focus', () => {
    render()
    open()
    pointer(document.body, 'pointerdown')
    expect(disclosure().open).toBe(false)
  })

  it('retains the panel while tabbing within it and closes when focus leaves', () => {
    render()
    open()
    const links = container.querySelectorAll('a')
    act(() => links[0]!.focus())
    act(() => links[1]!.focus())
    expect(disclosure().open).toBe(true)
    const outside = document.createElement('button')
    document.body.append(outside)
    act(() => outside.focus())
    expect(disclosure().open).toBe(false)
    outside.remove()
  })

  it('dismisses on client navigation', () => {
    render()
    open()
    route.pathname = '/stay'
    render()
    expect(disclosure().open).toBe(false)
  })

  it('enhances mouse hover but does not treat touch as hover', () => {
    render()
    pointer(disclosure(), 'pointerover', 'touch')
    expect(disclosure().open).toBe(false)
    pointer(disclosure(), 'pointerover')
    expect(disclosure().open).toBe(true)
    pointer(disclosure(), 'pointerout')
    expect(disclosure().open).toBe(false)
  })
  it('opens only one menu during mixed keyboard and mouse use without hiding focus', () => {
    act(() =>
      root.render(
        <>
          <DropdownNav label="Discover" wide>
            <a href="#stay">Stay</a>
          </DropdownNav>
          <DropdownNav label="Magazine">
            <a href="#issues">Issues</a>
          </DropdownNav>
        </>,
      ),
    )
    const menus = container.querySelectorAll('details')
    const first = menus[0]!
    const second = menus[1]!
    act(() => first.querySelector('summary')!.click())
    act(() => first.querySelector('a')!.focus())
    pointer(first, 'pointerout')
    expect(first.open).toBe(true)
    pointer(second, 'pointerover')
    expect(first.open).toBe(false)
    expect(second.open).toBe(true)
    expect(document.activeElement).toBe(first.querySelector('summary'))
    expect(container.querySelectorAll('details[open]')).toHaveLength(1)
  })

  it('closes peers before a native summary activation', () => {
    act(() =>
      root.render(
        <>
          <DropdownNav label="Discover">
            <a href="#stay">Stay</a>
          </DropdownNav>
          <DropdownNav label="About">
            <a href="#about">About us</a>
          </DropdownNav>
        </>,
      ),
    )
    const menus = container.querySelectorAll('details')
    act(() => menus[0]!.querySelector('summary')!.click())
    act(() => menus[1]!.querySelector('summary')!.click())
    expect(menus[0]!.open).toBe(false)
    expect(menus[1]!.open).toBe(true)
  })
})
