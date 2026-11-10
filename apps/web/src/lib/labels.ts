/**
 * Slug to human label, in the reader's language.
 *
 * All of these read from the shared taxonomy, so a category renamed in
 * packages/core changes here, in the admin dropdowns and in the app at once.
 * Unknown slugs return the slug itself rather than an empty string, which makes
 * a data problem visible on the page instead of silently blank.
 */

import { AMENITIES } from '@vardenia/core/attributes'
import { GOVERNORATES } from '@vardenia/core/regions'
import { type SiteSection } from '@vardenia/core/sections'
import { TAXONOMY } from '@vardenia/core/taxonomy'
import { sectionDescription, sectionLabel, taxonomyLabel, type Locale } from '@vardenia/i18n'

/**
 * Regions keep English and Arabic only: a governorate or district is a proper
 * noun, so every other language falls back to the English label (Beirut stays
 * Beirut). Categories, subcategories and amenities go through
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
