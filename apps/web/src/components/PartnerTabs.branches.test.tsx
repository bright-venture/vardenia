import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { PartnerTabs } from './PartnerTabs'

const state = vi.hoisted(() => ({ pathname: '/partner' }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('../i18n/routing', () => ({ Link: (props: ComponentProps<'a'>) => <a {...props} /> }))

const render = (extra: { branches?: string }) =>
  renderToStaticMarkup(
    <PartnerTabs
      bookings="Bookings"
      listing="Listing"
      scans="Scans"
      statements="Statements"
      {...extra}
    />,
  )

describe('partner navigation: listing details and branches (Task 12a)', () => {
  it.each([
    // The details page lives under the listing tab, which stays lit there.
    ['/partner/listing/details', '/partner/listing'],
    ['/ar/partner/listing/details/', '/partner/listing'],
    ['/ar/partner/branches', '/partner/branches'],
  ])('lights exactly one tab at %s', (pathname, expected) => {
    state.pathname = pathname
    const markup = render({ branches: 'Branches' })
    expect(markup).toContain(`href="${expected}" aria-current="page"`)
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('offers the branches tab only when it is given', () => {
    state.pathname = '/partner'
    const without = render({})
    expect(without.match(/<a /g)).toHaveLength(4)
    expect(without).not.toContain('/partner/branches')
    expect(render({ branches: 'Branches' })).toContain('href="/partner/branches"')
  })
})
