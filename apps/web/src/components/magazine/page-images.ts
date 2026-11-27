import type { PageLayout } from '@vardenia/core/page-layouts'
import type { MagazinePage, MagazineRegion } from '@vardenia/core/magazine-view'

/**
 * The designer's printed pages for an All Lebanon issue (27 November 2026):
 * the 200 pages of the blank All Lebanon magazine (Web Review v2), one WebP
 * per page in public/magazine-pages/all-lebanon, numbered like the PDF.
 *
 * Frontend only. The images are drawn only for an issue that IS this magazine:
 * it covers All Lebanon and its pages match the PDF one by one (same count,
 * same layout on every page, same pages without listings). Any other issue,
 * an All Lebanon template with fewer or more pages included, keeps the drawn
 * pages, so a printed page can never sit under the wrong slots.
 */
export const ALL_LEBANON_PAGE_COUNT = 200

/**
 * The PDF page by page (from its slot map CSV): "-" no listings, F full page,
 * S and s the two pages of a full spread, H half page, T 1/3, Q 1/4.
 */
export const ALL_LEBANON_PAGES =
  '-------FFFHHFQHHQFHHQHFQHQHQHHQ--Ss--HQTHQHFHHFQHHQTQHTQHHQ----FHSsHFQHHQTHHTHQTQHTQHHQ----' +
  'FHSsFHQFHQTQHTQHHQTQHTTH----FHTQHFQHHQTQHQSsHTQHHHQH----SsQHTHHTQHHQTHHTQHHQFFHQ----' +
  'FHHFQHTHSsHTQHHQTHHQHTQ--'

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

const pad = (n: number) => String(n).padStart(3, '0')

export function allLebanonPage(page: number): string | null {
  return Number.isInteger(page) && page >= 1 && page <= ALL_LEBANON_PAGE_COUNT
    ? `/magazine-pages/all-lebanon/${pad(page)}.webp`
    : null
}

/**
 * True when the blocks span more than one governorate, as an All Lebanon
 * issue's do (the viewer's data does not carry the coverage itself; a
 * one-governorate issue has one block per city, all in its governorate).
 */
export function coversAllLebanon(regions: readonly MagazineRegion[]): boolean {
  return new Set(regions.map((r) => r.governorate)).size > 1
}

/** The page images to draw for this issue, or null to draw the pages as before. */
export function pageImagesFor(
  regions: readonly MagazineRegion[],
  pages: readonly MagazinePage[],
): ((page: number) => string | null) | null {
  return coversAllLebanon(regions) && pageSignature(pages) === ALL_LEBANON_PAGES
    ? allLebanonPage
    : null
}
