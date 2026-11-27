import { describe, expect, it } from 'vitest'
import type { MagazinePage } from '@vardenia/core/magazine-view'
import {
  ALL_LEBANON_PAGES,
  ALL_LEBANON_PAGE_COUNT,
  allLebanonPage,
  coversAllLebanon,
  pageImagesFor,
  pageSignature,
} from './page-images'

const region = (governorate: string, firstPage: number, lastPage: number) => ({
  governorate,
  firstPage,
  lastPage,
})
const allLebanon = [region('beirut', 8, 31), region('matn', 34, 59)]

const LAYOUT = {
  F: 'full-page',
  H: 'half-page',
  T: 'three-third',
  Q: 'quarter-page',
  S: 'full-spread',
} as const

/** Pages as the viewer's data gives them, from the letters of a signature. */
function pagesOf(signature: string): MagazinePage[] {
  const pages: MagazinePage[] = []
  for (let i = 0; i < signature.length; i++) {
    const letter = signature[i] as string
    const page = i + 1
    if (letter === 's') continue // the second page of a spread
    if (letter === '-') pages.push({ page, kind: 'editorial', note: null })
    else {
      const layout = LAYOUT[letter as keyof typeof LAYOUT]
      pages.push({ page, kind: 'listings', layout, span: letter === 'S' ? 2 : 1, slots: [] })
    }
  }
  return pages
}

describe('page images', () => {
  it('names each of the 200 printed pages, and nothing past them', () => {
    expect(ALL_LEBANON_PAGES).toHaveLength(ALL_LEBANON_PAGE_COUNT)
    expect(allLebanonPage(1)).toBe('/magazine-pages/all-lebanon/001.webp')
    expect(allLebanonPage(200)).toBe('/magazine-pages/all-lebanon/200.webp')
    expect(allLebanonPage(0)).toBeNull()
    expect(allLebanonPage(201)).toBeNull()
  })

  it('writes the pages of an issue in the same letters as the PDF', () => {
    expect(pageSignature(pagesOf(ALL_LEBANON_PAGES))).toBe(ALL_LEBANON_PAGES)
  })

  it('treats blocks in several governorates as All Lebanon, one governorate as not', () => {
    expect(coversAllLebanon(allLebanon)).toBe(true)
    expect(
      coversAllLebanon([region('south-lebanon', 1, 10), region('south-lebanon', 11, 20)]),
    ).toBe(false)
    expect(coversAllLebanon([])).toBe(false)
  })

  it('gives the images to an All Lebanon issue whose pages are those of the PDF', () => {
    const images = pageImagesFor(allLebanon, pagesOf(ALL_LEBANON_PAGES))
    expect(images?.(66)).toBe('/magazine-pages/all-lebanon/066.webp')
  })

  it('draws the pages for an All Lebanon template with fewer or more pages', () => {
    expect(pageImagesFor(allLebanon, pagesOf(ALL_LEBANON_PAGES.slice(0, 199)))).toBeNull()
    expect(pageImagesFor(allLebanon, pagesOf(ALL_LEBANON_PAGES + '-'))).toBeNull()
    expect(pageImagesFor(allLebanon, pagesOf('FHQT'))).toBeNull()
  })

  it('draws the pages when one page has a different layout, even at 200 pages', () => {
    const changed = ALL_LEBANON_PAGES.replace('FFF', 'FFH') // page 10: full page -> half page
    expect(changed).toHaveLength(200)
    expect(pageImagesFor(allLebanon, pagesOf(changed))).toBeNull()
  })

  it('draws the pages for a one-governorate issue, even with the same pages', () => {
    expect(pageImagesFor([region('chouf', 1, 200)], pagesOf(ALL_LEBANON_PAGES))).toBeNull()
  })
})
