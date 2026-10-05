/**
 * Bridges the shared taxonomy into Payload select options.
 *
 * Categories and regions live in @vardenia/core as code rather than as CMS
 * documents on purpose: they change roughly never, they must be identical on
 * web/mobile/print, and a typo'd duplicate category created by an editor at
 * 2am is a class of bug worth designing out entirely.
 */

import { CATEGORIES, GOVERNORATES } from '@vardenia/core'

interface Option {
  label: string
  value: string
}

/**
 * Every slug the taxonomy has ever shipped, retired ones included.
 *
 * These become the Postgres enums, and an enum value cannot be dropped while a
 * row holds it - old versions of a listing keep the subcategory they were saved
 * with. So retiring a slug must never take it out of the type. What a person is
 * offered is narrowed in the collection instead, with `filterOptions`, and a
 * retired value is refused on save there. See Businesses and core/taxonomy.
 */
export const categoryOptions: Option[] = CATEGORIES.map((c) => ({
  label: c.retired ? `${c.en} (retired)` : c.en,
  value: c.slug,
}))

export const subcategoryOptions: Option[] = CATEGORIES.flatMap((category) =>
  category.children.map((child) => ({
    label: `${category.en} > ${child.en}${child.retired ? ' (retired)' : ''}`,
    value: child.slug,
  })),
)

export const governorateOptions: Option[] = GOVERNORATES.map((g) => ({
  label: g.en,
  value: g.slug,
}))

export const districtOptions: Option[] = GOVERNORATES.flatMap((governorate) =>
  governorate.districts.map((district) => ({
    label: `${governorate.en} > ${district.en}`,
    value: district.slug,
  })),
)
