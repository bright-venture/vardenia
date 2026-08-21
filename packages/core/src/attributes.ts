/**
 * The things a listing has, as opposed to the thing it is.
 *
 * Category and subcategory say what a place is; these say what it offers and
 * what it costs. They are filters on every list screen.
 *
 * # Why they moved here
 *
 * The amenity list was written out twice: once as `options` on the Businesses
 * collection and again as a label map in the web app. Two copies of sixteen
 * slugs, and nothing connecting them - rename one and the admin panel offers a
 * value the site renders as a raw slug. Adding a filter would have made three.
 *
 * One list, read by the collection, by the labels, and by the filters.
 */

export interface Labelled {
  slug: string
  en: string
  ar: string
}

/**
 * What a place offers.
 *
 * Ordered by how often somebody filters on it rather than alphabetically.
 * Accessibility is near the top deliberately: for the person who needs it, it is
 * not a preference among sixteen, it is the only question that matters.
 */
export const AMENITIES: readonly Labelled[] = [
  { slug: 'accessible', en: 'Wheelchair accessible', ar: 'مهيأ لذوي الاحتياجات' },
  { slug: 'family-friendly', en: 'Family friendly', ar: 'مناسب للعائلات' },
  { slug: 'outdoor-seating', en: 'Outdoor seating', ar: 'جلسات خارجية' },
  { slug: 'sea-view', en: 'Sea view', ar: 'إطلالة على البحر' },
  { slug: 'mountain-view', en: 'Mountain view', ar: 'إطلالة جبلية' },
  { slug: 'pool', en: 'Pool', ar: 'مسبح' },
  { slug: 'spa', en: 'Spa', ar: 'سبا' },
  { slug: 'free-parking', en: 'Free parking', ar: 'موقف مجاني' },
  { slug: 'valet-parking', en: 'Valet parking', ar: 'خدمة ركن السيارات' },
  { slug: 'pet-friendly', en: 'Pet friendly', ar: 'يسمح بالحيوانات الأليفة' },
  { slug: 'live-music', en: 'Live music', ar: 'موسيقى حية' },
  { slug: 'alcohol', en: 'Alcohol served', ar: 'يقدم الكحول' },
  { slug: 'halal', en: 'Halal options', ar: 'خيارات حلال' },
  { slug: 'vegetarian', en: 'Vegetarian options', ar: 'خيارات نباتية' },
  { slug: 'wifi', en: 'Wi-Fi', ar: 'واي فاي' },
  { slug: 'air-conditioning', en: 'Air conditioning', ar: 'تكييف' },
]

/**
 * Price bands.
 *
 * Stored as the strings '1' to '4' because Payload select values are strings,
 * and changing that now would be a migration for no gain. `marks` is what a
 * reader sees; the admin panel wants the word as well as the symbol.
 */
export const PRICE_RANGES: readonly (Labelled & { marks: string })[] = [
  { slug: '1', marks: '$', en: 'Budget', ar: 'اقتصادي' },
  { slug: '2', marks: '$$', en: 'Moderate', ar: 'متوسط' },
  { slug: '3', marks: '$$$', en: 'Upscale', ar: 'راقٍ' },
  { slug: '4', marks: '$$$$', en: 'Luxury', ar: 'فاخر' },
]

export const AMENITY_SLUGS: readonly string[] = AMENITIES.map((a) => a.slug)
export const PRICE_SLUGS: readonly string[] = PRICE_RANGES.map((p) => p.slug)

/** Payload `options`, so the collection and the filters cannot describe different things. */
export const amenityOptions = AMENITIES.map((a) => ({ label: a.en, value: a.slug }))

export const priceRangeOptions = PRICE_RANGES.map((p) => ({
  label: `${p.marks} - ${p.en}`,
  value: p.slug,
}))
