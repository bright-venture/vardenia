import type { PageLayout } from '@vardenia/core/page-layouts'
import type { MagazinePage } from '@vardenia/core/magazine-view'

/**
 * The designers' printed pages, built into the site (28 November 2026).
 *
 * Each design is a folder of page images in public/magazine-pages/<folder>
 * (001.webp, 002.webp, ...) and the shape of the template it was drawn for:
 * one letter per page, in page order. An issue shows a design's pages when its
 * template has exactly that shape: the same number of pages, the same layout
 * on every page, the same pages without listings. Nothing else is compared,
 * so the template's name, id and the issue's coverage or blocks do not matter
 * (a production template entered with the same pages matches too). An issue
 * whose template matches no design keeps the drawn pages, so a printed page
 * can never sit under the wrong slots.
 *
 * Adding a design: put its pages in public/magazine-pages/<folder>, then add
 * an entry below with the shape read from its slot map (letters below). Later
 * the admin will upload a design onto a template instead (no deploy).
 *
 * Letters: "-" no listings (cover, intro, divider), F full page, S and s the
 * two pages of a full spread, H half page, T 1/3, Q 1/4.
 */
export interface BuiltInDesign {
  /** Folder under public/magazine-pages. */
  folder: string
  /** What it is, for people reading this list. */
  name: string
  /** The template's pages in letters, one per page. */
  shape: string
}

export const DESIGNS: readonly BuiltInDesign[] = [
  {
    folder: 'all-lebanon',
    name: 'All Lebanon (Blank Web Review v2, 200 pages)',
    shape:
      '-------FFFHHFQHHQFHHQHFQHQHQHHQ--Ss--HQTHQHFHHFQHHQTQHTQHHQ----FHSsHFQHHQTHHTHQTQHTQHHQ----' +
      'FHSsFHQFHQTQHTQHHQTQHTTH----FHTQHFQHHQTQHQSsHTQHHHQH----SsQHTHHTQHHQTHHTQHHQFFHQ----' +
      'FHHFQHTHSsHTQHHQTHHQHTQ--',
  },
]

const CODE: Record<PageLayout, string> = {
  'full-spread': 'Ss',
  'full-page': 'F',
  'half-page': 'H',
  'three-third': 'T',
  'quarter-page': 'Q',
}

/** An issue's pages in the same letters, in page order. */
export function pageSignature(pages: readonly MagazinePage[]): string {
  return [...pages]
    .sort((a, b) => a.page - b.page)
    .map((p) => (p.kind === 'listings' ? (CODE[p.layout] ?? '?') : '-'))
    .join('')
}

/** The design drawn for this shape of template, or null. */
export function designFor(pages: readonly MagazinePage[]): BuiltInDesign | null {
  if (pages.length === 0) return null
  const shape = pageSignature(pages)
  return DESIGNS.find((d) => d.shape === shape) ?? null
}

const pad = (n: number) => String(n).padStart(3, '0')

/** The image of one page of a design; null past its last page. */
export function designPage(design: BuiltInDesign, page: number): string | null {
  return Number.isInteger(page) && page >= 1 && page <= design.shape.length
    ? `/magazine-pages/${design.folder}/${pad(page)}.webp`
    : null
}

/** The page images to draw for this issue, or null to draw the pages as before. */
export function pageImagesFor(
  pages: readonly MagazinePage[],
): ((page: number) => string | null) | null {
  const design = designFor(pages)
  return design ? (page) => designPage(design, page) : null
}
