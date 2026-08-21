/**
 * Slug to human label, in the reader's language.
 *
 * All of these read from the shared taxonomy, so a category renamed in
 * packages/core changes here, in the admin dropdowns and in the app at once.
 * Unknown slugs return the slug itself rather than an empty string, which makes
 * a data problem visible on the page instead of silently blank.
 */

import { AMENITIES, GOVERNORATES, PRICE_RANGES, TAXONOMY } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'

const pick = (entry: { en: string; ar: string }, locale: Locale) =>
  locale === 'ar' ? entry.ar : entry.en

export function categoryLabel(slug: string | null | undefined, locale: Locale): string {
  if (!slug) return ''
  const found = TAXONOMY.find((c) => c.slug === slug)
  return found ? pick(found, locale) : slug
}

export function subcategoryLabel(slug: string | null | undefined, locale: Locale): string {
  if (!slug) return ''
  for (const category of TAXONOMY) {
    const child = category.children.find((c) => c.slug === slug)
    if (child) return pick(child, locale)
  }
  return slug
}

export function governorateLabel(slug: string | null | undefined, locale: Locale): string {
  if (!slug) return ''
  const found = GOVERNORATES.find((g) => g.slug === slug)
  return found ? pick(found, locale) : slug
}

export function districtLabel(slug: string | null | undefined, locale: Locale): string {
  if (!slug) return ''
  for (const governorate of GOVERNORATES) {
    const district = governorate.districts.find((d) => d.slug === slug)
    if (district) return pick(district, locale)
  }
  return slug
}

/** "Mount Lebanon" or "Keserwan, Mount Lebanon" when a district is set. */
export function placeLabel(
  governorate: string | null | undefined,
  district: string | null | undefined,
  locale: Locale,
): string {
  const g = governorateLabel(governorate, locale)
  const d = districtLabel(district, locale)
  if (d && g && d !== g) return `${d}, ${g}`
  return d || g
}

export function amenityLabel(slug: string, locale: Locale): string {
  const found = AMENITIES.find((a) => a.slug === slug)
  return found ? pick(found, locale) : slug
}

/** "$$$" for a stored band, in either language. Marks are not translated. */
export function priceMarks(slug: string | null | undefined): string | null {
  return PRICE_RANGES.find((p) => p.slug === String(slug))?.marks ?? null
}

/** Price band as repeated currency marks, e.g. 3 becomes "$$$". */
export function priceLabel(range: string | number | null | undefined): string | null {
  const value = typeof range === 'string' ? Number(range) : range
  if (!value || Number.isNaN(value) || value < 1 || value > 4) return null
  return '$'.repeat(value)
}
