import type { Payload, PayloadRequest } from 'payload'
import {
  DEFAULT_MAX_GOLD_PER_CATEGORY,
  DEFAULT_MAX_PLATINUM,
  LISTING_TIERS,
  can,
  type ListingTier,
} from '@vardenia/core'

/**
 * The two caps an admin sets on the Settings page (globals/Settings, Tiers
 * section): how many gold listings one category can hold, and how many
 * platinum listings there can be in all (which is how many the home page band
 * shows). They replace the single "gold places" number, which is no longer read.
 */
export interface TierLimits {
  maxGoldPerCategory: number
  maxPlatinum: number
}

/**
 * The tiers the home page band draws from: every tier whose capabilities say
 * `homePage`. Declared in packages/core/src/tiers, read here, never hardcoded.
 */
export const HOME_PAGE_TIERS: ListingTier[] = LISTING_TIERS.filter((tier) => can(tier, 'homePage'))

/**
 * Read with access overridden, because the platinum number decides what
 * anonymous visitors see on the home page. Never throws: a setting that cannot
 * be read falls back to the defaults rather than taking the home page down.
 */
export async function tierLimits(payload: Payload, req?: PayloadRequest): Promise<TierLimits> {
  const settings = (await payload
    .findGlobal({ slug: 'settings', depth: 0, overrideAccess: true, ...(req ? { req } : {}) })
    .catch(() => null)) as {
    maxGoldPerCategory?: number | null
    maxPlatinum?: number | null
  } | null
  return {
    maxGoldPerCategory: limitOrDefault(settings?.maxGoldPerCategory, DEFAULT_MAX_GOLD_PER_CATEGORY),
    maxPlatinum: limitOrDefault(settings?.maxPlatinum, DEFAULT_MAX_PLATINUM),
  }
}

/** A usable number of places, or the default. */
export function limitOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}
