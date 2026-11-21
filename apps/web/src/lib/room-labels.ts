import { roomOptionLabel } from '@vardenia/core/hotel-options'

/** The part of a `rooms` translator this needs (next-intl's `t` and `t.has`). */
export interface RoomsTranslator {
  (key: string): string
  has(key: string): boolean
}

/**
 * The label of a room view or in-room amenity. The `rooms` messages carry the
 * original slugs translated in all ten languages, so those win; the slugs added
 * in Task 5 are not in them and fall back to core's English and Arabic labels.
 */
export function roomLabel(
  t: RoomsTranslator,
  kind: 'views' | 'amenities',
  slug: string,
  locale: string,
): string {
  const key = `${kind}.${slug}`
  return t.has(key) ? t(key) : roomOptionLabel(slug, locale)
}
