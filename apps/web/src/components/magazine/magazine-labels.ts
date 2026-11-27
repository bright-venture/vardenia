import { PAGE_LAYOUTS, type PageLayout } from '@vardenia/core/page-layouts'
import type { Locale } from '@vardenia/i18n'
import { categoryLabel, governorateLabel } from '../../lib/labels'

/** The words the page cards draw, already in the reader's language. */
export interface MagazineLabels {
  /** "Listing 12": a free number. */
  listing: (number: number) => string
  you: string
  /** "Page 4": the editorial page without a note. */
  page: (page: number) => string
  layout: (layout: PageLayout) => string
  /** A category slug in the reader's language (the slug itself when unknown). */
  category: (slug: string) => string
  /** A governorate slug in the reader's language. */
  governorate: (slug: string) => string
}

type Translate = (key: string, values?: Record<string, string | number>) => string

/**
 * `t` reads the `magazineViewer` namespace and `layoutT` the form's
 * `magazinePlaces.form.layouts`, so a layout is named the same in both places.
 */
export function buildMagazineLabels(
  t: Translate,
  layoutT: Translate,
  locale: Locale,
): MagazineLabels {
  return {
    listing: (number) => t('freeListing', { number }),
    you: t('you'),
    page: (page) => t('page', { page }),
    layout: (layout) => (PAGE_LAYOUTS.includes(layout) ? layoutT(layout) : layout),
    category: (slug) => categoryLabel(slug, locale),
    governorate: (slug) => governorateLabel(slug, locale),
  }
}
