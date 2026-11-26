import { isSeatingAreaKey, seatingAreasOf, type SeatingAreaKey } from '@vardenia/core'

/**
 * What to call a booking's seating area on a card (QA CORE-B1): the name the
 * listing gave the area, else the translated standard name, else the key as
 * stored. Null when the booking has none.
 */
export function seatingAreaLabel(
  listing: unknown,
  key: string | null | undefined,
  names: Partial<Record<SeatingAreaKey, string>>,
): string | null {
  if (!key) return null
  if (typeof listing === 'object' && listing !== null) {
    const custom = seatingAreasOf(listing as Parameters<typeof seatingAreasOf>[0]).find(
      (area) => area.key === key,
    )?.label
    if (custom) return custom
  }
  return (isSeatingAreaKey(key) ? names[key] : undefined) ?? key
}
