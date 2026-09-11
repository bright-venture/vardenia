/**
 * Slug to human label, in the reader's language.
 *
 * All of these read from the shared taxonomy, so a category renamed in
 * packages/core changes here, in the admin dropdowns and in the app at once.
 * Unknown slugs return the slug itself rather than an empty string, which makes
 * a data problem visible on the page instead of silently blank.
 */

import { AMENITIES, GOVERNORATES, PRICE_RANGES, TAXONOMY, type SiteSection } from '@vardenia/core'
import { sectionDescription, sectionLabel, taxonomyLabel, type Locale } from '@vardenia/i18n'

/**
 * Regions keep English and Arabic only: a governorate or district is a proper
 * noun, so every other language falls back to the English label (Beirut stays
 * Beirut). Categories, subcategories, amenities and price bands go through
 * `localize`, which additionally consults the taxonomy translations in
 * @vardenia/i18n for the other eight UI languages, falling back to core's
 * English when there is no override.
 */
const pick = (entry: { en: string; ar: string }, locale: Locale) =>
  locale === 'ar' ? entry.ar : entry.en

const localize = (entry: { slug: string; en: string; ar: string }, locale: Locale) =>
  locale === 'ar'
    ? entry.ar
    : locale === 'en'
      ? entry.en
      : (taxonomyLabel(entry.slug, locale) ?? entry.en)

export function categoryLabel(slug: string | null | undefined, locale: Locale): string {
  if (!slug) return ''
  const found = TAXONOMY.find((c) => c.slug === slug)
  return found ? localize(found, locale) : slug
}

export function subcategoryLabel(slug: string | null | undefined, locale: Locale): string {
  if (!slug) return ''
  for (const category of TAXONOMY) {
    const child = category.children.find((c) => c.slug === slug)
    if (child) return localize(child, locale)
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
  return found ? localize(found, locale) : slug
}

/** The word for a price band, e.g. "Upscale", in the reader's language. */
export function priceBandLabel(slug: string | null | undefined, locale: Locale): string {
  if (!slug) return ''
  const found = PRICE_RANGES.find((p) => p.slug === String(slug))
  return found ? localize(found, locale) : String(slug)
}

/** "$$$" for a stored band. Marks are not translated. */
export function priceMarks(slug: string | null | undefined): string | null {
  return PRICE_RANGES.find((p) => p.slug === String(slug))?.marks ?? null
}

/** Price band as repeated currency marks, e.g. 3 becomes "$$$". */
export function priceLabel(range: string | number | null | undefined): string | null {
  const value = typeof range === 'string' ? Number(range) : range
  if (!value || Number.isNaN(value) || value < 1 || value > 4) return null
  return '$'.repeat(value)
}

/**
 * A section's name and one-line summary, in the reader's language.
 *
 * English and Arabic are the section's own fields (they seed the taxonomy and
 * print); the other eight UI languages come from the section translations in
 * @vardenia/i18n, falling back to the English field.
 */
export function sectionName(section: SiteSection, locale: Locale): string {
  return locale === 'ar'
    ? section.ar
    : locale === 'en'
      ? section.en
      : (sectionLabel(section.path, locale) ?? section.en)
}

export function sectionSummary(section: SiteSection, locale: Locale): string {
  return locale === 'ar'
    ? section.descriptionAr
    : locale === 'en'
      ? section.descriptionEn
      : (sectionDescription(section.path, locale) ?? section.descriptionEn)
}
