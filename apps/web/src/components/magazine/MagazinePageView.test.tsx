// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { PageLayout } from '@vardenia/core/page-layouts'
import type { MagazinePage } from '@vardenia/core/magazine-view'
import { MagazinePageView } from './MagazinePageView'
import type { MagazineLabels } from './magazine-labels'
import type { MagazineBusiness } from './types'
import { mergeRegions } from './regions'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const labels: MagazineLabels = {
  listing: (n) => `Listing ${n}`,
  you: 'You',
  page: (p) => `Page ${p}`,
  layout: (l) => `layout:${l}`,
  category: (s) => `cat:${s}`,
  governorate: (s) => `gov:${s}`,
}

const business = (number: number, extra: Partial<MagazineBusiness> = {}): MagazineBusiness => ({
  number,
  name: `Name ${number}`,
  tagline: '',
  category: 'cafe',
  governorate: 'beirut',
  address: 'Hamra',
  hours: 'Mon-Fri 09:00-23:00',
  phone: '01 234 567',
  description: 'A calm place.',
  photoUrl: '/media/x.webp',
  ...extra,
})

const listings = (layout: PageLayout, numbers: number[], span: 1 | 2 = 1): MagazinePage => ({
  page: 4,
  kind: 'listings',
  layout,
  span,
  slots: numbers.map((number, i) => ({ number, position: i + 1 })),
})

let host: HTMLElement
let root: Root
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function draw(
  page: MagazinePage,
  list: MagazineBusiness[] = [],
  over: { highlight?: number | null; region?: string | null; dir?: 'ltr' | 'rtl' } = {},
) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root.render(
      <MagazinePageView
        page={page}
        businesses={new Map(list.map((b) => [b.number, b]))}
        regionName={over.region === undefined ? 'Beirut' : over.region}
        highlight={over.highlight ?? null}
        labels={labels}
        dir={over.dir ?? 'ltr'}
      />,
    ),
  )
  return host
}

const numbersOf = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-number]')].map((n) => Number(n.getAttribute('data-number')))

describe('MagazinePageView layouts', () => {
  it.each([
    ['full-spread', [1]],
    ['full-page', [2]],
    ['half-page', [3, 4]],
    ['three-third', [5, 6, 7]],
    ['quarter-page', [8, 9, 10, 11]],
  ] as [PageLayout, number[]][])('%s draws its cards in order', (layout, numbers) => {
    const el = draw(listings(layout, numbers, layout === 'full-spread' ? 2 : 1))
    expect(numbersOf(el)).toEqual(numbers)
  })

  it('draws a full spread twice as wide as a page', () => {
    const el = draw(listings('full-spread', [1], 2))
    const page = el.querySelector('[data-page]') as HTMLElement
    expect(page.getAttribute('data-span')).toBe('2')
    expect(page.style.aspectRatio.replace(/\s/g, '')).toBe('420/297')
  })

  it('draws a free number as a grey box with its number and layout', () => {
    const el = draw(listings('half-page', [3, 4]), [business(4)])
    const free = el.querySelector('[data-number="3"]') as HTMLElement
    expect(free.hasAttribute('data-free')).toBe(true)
    expect(free.textContent).toContain('Listing 3')
    expect(free.textContent).toContain('layout:half-page')
    expect(el.querySelector('[data-number="4"]')?.textContent).toContain('Name 4')
  })

  it('localizes the category and shows hours as given', () => {
    const el = draw(listings('full-page', [1]), [business(1)])
    expect(el.textContent).toContain('cat:cafe')
    expect(el.textContent).toContain('Mon-Fri 09:00-23:00')
  })

  it('draws a placeholder, not a crash, with no photo and no description', () => {
    const el = draw(listings('full-page', [1]), [business(1, { photoUrl: null, description: '' })])
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('[data-photo-placeholder]')).not.toBeNull()
    expect(el.querySelector('[data-description]')).toBeNull()
  })

  it('uses the photo when there is one', () => {
    const el = draw(listings('full-page', [1]), [business(1)])
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/media/x.webp')
  })

  it('clamps a long name and a long description', () => {
    const el = draw(listings('full-page', [1]), [
      business(1, { name: 'N'.repeat(200), description: 'word '.repeat(2000) }),
    ])
    expect((el.querySelector('h3')?.textContent ?? '').length).toBeLessThanOrEqual(60)
    expect((el.querySelector('[data-description]')?.textContent ?? '').length).toBeLessThanOrEqual(
      600,
    )
    expect(el.querySelector('[data-description]')?.getAttribute('style')).toContain('line-clamp')
    expect(el.querySelector('h3')?.getAttribute('style')).toContain('line-clamp')
  })

  it('highlights only the given number and says "You"', () => {
    const el = draw(listings('half-page', [3, 4]), [business(3), business(4)], { highlight: 4 })
    expect(el.querySelectorAll('[data-you]')).toHaveLength(1)
    expect(el.querySelector('[data-number="4"] [data-you]')).not.toBeNull()
    expect(el.querySelector('[data-number="3"] [data-you]')).toBeNull()
  })

  it('highlights a free number too', () => {
    const el = draw(listings('full-page', [1]), [], { highlight: 1 })
    expect(el.querySelector('[data-number="1"] [data-you]')).not.toBeNull()
  })

  it('shows the footer with page and region, and omits a missing region', () => {
    expect(draw(listings('full-page', [1]), []).querySelector('[data-footer]')?.textContent).toBe(
      'VARDENIA.COM | 4 | BEIRUT',
    )
    act(() => root.unmount())
    host.remove()
    expect(
      draw(listings('full-page', [1]), [], { region: null }).querySelector('[data-footer]')
        ?.textContent,
    ).toBe('VARDENIA.COM | 4')
  })

  it('draws an editorial page with its note, or its number', () => {
    const el = draw({ page: 2, kind: 'editorial', note: 'Welcome to Beirut' })
    expect(el.querySelector('[data-editorial]')?.textContent).toBe('Welcome to Beirut')
    expect(el.querySelector('[data-number]')).toBeNull()
    act(() => root.unmount())
    host.remove()
    expect(
      draw({ page: 2, kind: 'editorial', note: null }).querySelector('[data-editorial]')
        ?.textContent,
    ).toBe('Page 2')
  })
})

describe('mergeRegions', () => {
  it('merges a governorate repeated per city block into its first..last page', () => {
    expect(
      mergeRegions([
        { governorate: 'beirut', firstPage: 4, lastPage: 6 },
        { governorate: 'beirut', firstPage: 7, lastPage: 9 },
        { governorate: 'metn', firstPage: 10, lastPage: 12 },
      ]),
    ).toEqual([
      { governorate: 'beirut', firstPage: 4, lastPage: 9 },
      { governorate: 'metn', firstPage: 10, lastPage: 12 },
    ])
  })
})
