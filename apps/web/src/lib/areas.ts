import { getPayload } from 'payload'
import { unstable_cache } from 'next/cache'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'

/**
 * The areas of every region, named in the reader's language, for the
 * directory's Filters (18 November 2026). Cached and cleared when an area
 * changes (tag `areas`, see collections/Areas).
 */
export interface AreaOption {
  slug: string
  name: string
  governorate: string
}

export async function areaOptions(locale: Locale): Promise<AreaOption[]> {
  const load = async (): Promise<AreaOption[]> => {
    const payload = await getPayload({ config })
    const result = await payload.find({
      collection: 'areas',
      depth: 0,
      limit: 500,
      pagination: false,
      locale: dataLocale(locale),
      sort: ['governorate', 'order', 'name'],
      select: { slug: true, name: true, governorate: true },
    })
    return result.docs.map((doc) => ({
      slug: String((doc as { slug?: unknown }).slug ?? ''),
      name: String((doc as { name?: unknown }).name ?? ''),
      governorate: String((doc as { governorate?: unknown }).governorate ?? ''),
    }))
  }
  try {
    const cached = await unstable_cache(load, ['area-options', locale], {
      revalidate: 3600,
      tags: ['areas'],
    })()
    // An empty list is never kept: it means the areas were not there yet (or
    // were added straight into the database), and an hour of no Area filter
    // would be the result. Asked again instead; it is one small query.
    return cached.length > 0 ? cached : await load()
  } catch {
    // A failed read is not cached either (it throws out of unstable_cache).
    return []
  }
}
