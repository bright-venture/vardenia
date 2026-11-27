import type { MagazineRegion } from '@vardenia/core/magazine-view'

/**
 * The route lists one region per listing-ranges row, so a one-governorate
 * issue repeats its governorate once per city block. A reader jumps to a
 * governorate, so merge the repeats into its overall first..last page,
 * keeping the order in which each governorate first appears.
 */
export function mergeRegions(regions: readonly MagazineRegion[]): MagazineRegion[] {
  const merged = new Map<string, MagazineRegion>()
  for (const region of regions) {
    const have = merged.get(region.governorate)
    if (!have) merged.set(region.governorate, { ...region })
    else {
      have.firstPage = Math.min(have.firstPage, region.firstPage)
      have.lastPage = Math.max(have.lastPage, region.lastPage)
    }
  }
  return [...merged.values()]
}
