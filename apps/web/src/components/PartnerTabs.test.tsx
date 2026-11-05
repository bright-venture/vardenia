import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { PartnerTabs } from './PartnerTabs'
const state = vi.hoisted(() => ({ pathname: '/partner' }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('../i18n/routing', () => ({ Link: (props: ComponentProps<'a'>) => <a {...props} /> }))

describe('partner navigation', () => {
  it.each([
    ['/partner', '/partner'],
    ['/ar/partner/listing/', '/partner/listing'],
    ['/ar/partner/scans/', '/partner/scans'],
    ['/partner/statements/12', '/partner/statements'],
  ])('identifies the current section at %s', (pathname, expected) => {
    state.pathname = pathname
    const markup = renderToStaticMarkup(
      <PartnerTabs bookings="Bookings" listing="Listing" scans="Scans" statements="Statements" />,
    )
    expect(markup).toContain(`href="${expected}" aria-current="page"`)
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
    expect(markup).toContain('focus-visible:outline')
    expect(markup).toContain('min-h-11')
  })
})

describe('mobile partner tab visibility', () => {
  it('lays out every destination in a wrapping two-column grid instead of an offscreen rail', () => {
    const css = readFileSync(new URL('./PartnerTabs.module.css', import.meta.url), 'utf8')
    expect(css).toMatch(/display:\s*grid/)
    expect(css).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/white-space:\s*normal/)
    expect(css).toMatch(/overflow-wrap:\s*anywhere/)
    expect(css).toMatch(/@media \(min-width: 640px\)/)
    expect(css).toMatch(/flex-wrap:\s*wrap/)
    state.pathname = '/ar/partner/statements'
    const markup = renderToStaticMarkup(
      <PartnerTabs bookings="الحجوزات" listing="قائمتك" scans="المسح" statements="كشوف الحساب" />,
    )
    expect(markup).toContain('navigation')
    expect(markup.match(/<a /g)).toHaveLength(4)
    expect(markup).toContain('href="/partner/statements" aria-current="page"')
  })
})
