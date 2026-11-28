import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { MagazinePage } from '@vardenia/core/magazine-view'
import { DESIGNS, designFor, designPage, pageImagesFor, pageSignature } from './page-images'

const LAYOUT = {
  F: 'full-page',
  H: 'half-page',
  T: 'three-third',
  Q: 'quarter-page',
  S: 'full-spread',
} as const

/** Pages as the viewer's data gives them, from the letters of a shape. */
function pagesOf(shape: string): MagazinePage[] {
  const pages: MagazinePage[] = []
  for (let i = 0; i < shape.length; i++) {
    const letter = shape[i] as string
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

const allLebanon = DESIGNS.find((d) => d.folder === 'all-lebanon')!

describe('built-in designs', () => {
  it.each(DESIGNS.map((d) => [d.folder, d] as const))(
    '%s: has a shape of known letters, a spread always on two pages, and every page image',
    (_folder, design) => {
      expect(design.shape).toMatch(/^[-FHTQSs]+$/)
      expect(design.shape.replace(/Ss/g, '')).not.toMatch(/[Ss]/)
      for (let page = 1; page <= design.shape.length; page++) {
        const file = new URL(`../../../public${designPage(design, page)}`, import.meta.url)
        expect(existsSync(file), `page ${page}`).toBe(true)
      }
    },
  )

  it('has no two designs for the same shape', () => {
    const shapes = DESIGNS.map((d) => d.shape)
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it('keeps the All Lebanon design at 200 pages', () => {
    expect(allLebanon.shape).toHaveLength(200)
    expect(designPage(allLebanon, 1)).toBe('/magazine-pages/all-lebanon/001.webp')
    expect(designPage(allLebanon, 200)).toBe('/magazine-pages/all-lebanon/200.webp')
    expect(designPage(allLebanon, 0)).toBeNull()
    expect(designPage(allLebanon, 201)).toBeNull()
  })
})

describe('matching a template to a design', () => {
  it('writes the pages of an issue in the same letters as a design', () => {
    expect(pageSignature(pagesOf(allLebanon.shape))).toBe(allLebanon.shape)
  })

  it('finds the design by the shape of the pages alone', () => {
    expect(designFor(pagesOf(allLebanon.shape))).toBe(allLebanon)
    expect(pageImagesFor(pagesOf(allLebanon.shape))?.(66)).toBe(
      '/magazine-pages/all-lebanon/066.webp',
    )
  })

  it('finds no design for a template with fewer or more pages', () => {
    expect(designFor(pagesOf(allLebanon.shape.slice(0, 199)))).toBeNull()
    expect(designFor(pagesOf(allLebanon.shape + '-'))).toBeNull()
    expect(designFor(pagesOf('FHQT'))).toBeNull()
    expect(pageImagesFor([])).toBeNull()
  })

  it('finds no design when one page has a different layout, even at the same length', () => {
    const changed = allLebanon.shape.replace('FFF', 'FFH') // page 10: full page -> half page
    expect(changed).toHaveLength(200)
    expect(designFor(pagesOf(changed))).toBeNull()
  })
})
