import {
  DEFAULT_LISTING_TOTAL,
  allocatedCount,
  nextFreeNumber,
  type NumberRange,
} from '@vardenia/core'

export interface AllocationSummary {
  allocated: number
  total: number
  next: number
  /** `full` when every number of the issue is handed out. */
  state: 'open' | 'full'
  text: string
}

/**
 * The line staff read on an issue: how much of its numbering is handed out.
 *
 * `total` is the issue's own count, null for issues made before the field
 * existed, which read as the default. Kept out of the component so it is
 * tested without rendering anything.
 */
export function allocationSummary(
  ranges: readonly NumberRange[],
  total: number | null | undefined,
): AllocationSummary {
  const size = total ?? DEFAULT_LISTING_TOTAL
  const allocated = allocatedCount(ranges)
  const next = nextFreeNumber(ranges)
  const state = allocated >= size ? 'full' : 'open'
  const text =
    state === 'full'
      ? `${allocated} of ${size} allocated, all numbers allocated`
      : `${allocated} of ${size} allocated, next free number ${next}`
  return { allocated, total: size, next, state, text }
}
