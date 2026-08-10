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

export const categoryOptions: Option[] = CATEGORIES.filter((c) => !c.retired).map((c) => ({
  label: c.en,
  value: c.slug,
}))

export const subcategoryOptions: Option[] = CATEGORIES.flatMap((category) =>
  category.children
    .filter((child) => !child.retired)
    .map((child) => ({
      label: `${category.en} > ${child.en}`,
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
