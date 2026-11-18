import type { CollectionAfterChangeHook, CollectionConfig } from 'payload'
import { AREA_SLUG } from '@vardenia/core'
import { anyone, isStaff } from '../access/index'
import { governorateOptions } from './options'
import { clearListingsCache } from '../hooks/revalidateListings'

/**
 * Areas: the neighbourhoods and towns guests filter by (18 November 2026),
 * Achrafieh in Beirut, Faraya in Keserwan. Each belongs to one region. A
 * listing names its area, and the directory's Filters show the chosen
 * region's areas with how many places each has, 0 included.
 *
 * Managed by the team here, so adding Mar Mikhael or Batroun needs no code.
 * The slug is what goes in the address (?area=achrafieh), so it is kept once
 * set. Seeded from core AREA_SEED by migration 20261118_areas.
 */

const clearAreas: CollectionAfterChangeHook = async ({ doc }) => {
  await clearListingsCache()
  try {
    const { revalidateTag } = await import('next/cache')
    revalidateTag('areas', { expire: 0 })
  } catch {
    // Outside a Next request: nothing cached.
  }
  return doc
}

export const Areas: CollectionConfig = {
  slug: 'areas',
  labels: { singular: 'Area', plural: 'Areas' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'governorate', 'slug', 'order'],
    group: 'Directory',
    description:
      'Neighbourhoods and towns guests filter by (Achrafieh, Faraya). Each belongs to one region.',
  },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  hooks: { afterChange: [clearAreas] },
  fields: [
    { name: 'name', type: 'text', required: true, localized: true, maxLength: 80 },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) =>
        typeof value === 'string' && AREA_SLUG.test(value)
          ? true
          : 'Lowercase words joined by hyphens, like mar-mikhael.',
      admin: { description: 'In the web address (?area=mar-mikhael). Keep it once set.' },
    },
    {
      name: 'governorate',
      label: 'Region',
      type: 'select',
      required: true,
      index: true,
      options: governorateOptions,
    },
    { name: 'order', type: 'number', defaultValue: 0, admin: { description: 'Lower first.' } },
  ],
}
