import type { Payload, PayloadRequest } from 'payload'
import { HOME_PAGE_PLACES } from '@vardenia/core'

/**
 * How many gold listings there can be: the number on the admin's Settings page
 * (globals/Settings, Tiers section), or HOME_PAGE_PLACES while it is empty.
 *
 * Read with access overridden, because it decides what anonymous visitors see
 * on the home page. Never throws: a setting that cannot be read falls back to
 * the default rather than taking the home page down with it.
 */
export async function goldPlaces(payload: Payload, req?: PayloadRequest): Promise<number> {
  const settings = (await payload
    .findGlobal({ slug: 'settings', depth: 0, overrideAccess: true, ...(req ? { req } : {}) })
    .catch(() => null)) as { goldPlaces?: number | null } | null
  return placesOrDefault(settings?.goldPlaces)
}

/** A usable number of places, or the default. */
export function placesOrDefault(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : HOME_PAGE_PLACES
}
