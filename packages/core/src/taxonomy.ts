/**
 * The Vardenia directory taxonomy.
 *
 * This is the single source of truth. The CMS seeds its `categories` collection
 * from here, the web filters render from here, and the mobile app's browse tabs
 * read from here - so a category can never exist on one surface and not another.
 *
 * Adding a category: append to this file, then run `pnpm --filter web seed:taxonomy`.
 * Never delete a slug that has shipped - retire it with `retired: true` instead,
 * or you break every printed QR code pointing at that category page.
 *
 * # The October 2026 list, and the one time slugs were deleted
 *
 * Six sections and sixteen kinds of place, down from seven and fifty-seven.
 * The long list described a directory Vardenia might one day have; this one
 * describes the one it has and sells.
 *
 * The old slugs were deleted outright rather than retired, which the rule above
 * forbids. It was safe exactly once: before launch, with no link to a category
 * in anybody's hands and no QR code aimed at one. The migration that did it
 * moved every listing and every saved version onto this list first, then rebuilt
 * the Postgres enums without the old values. From launch on, the rule holds.
 *
 * # Bookable or advertised
 *
 * `bookable` says whether a kind of place can take bookings through Vardenia at
 * all. Hotels, restaurants, tours and drivers can; a mall, a café, a festival or
 * a historic site is listed and advertised but never booked. A listing may turn
 * booking on only when one of its kinds of place is bookable - see
 * `canTakeBookings`.
 */

export interface SubCategory {
  slug: string
  en: string
  ar: string
  /** Takes bookings through Vardenia. Absent means listed and advertised only. */
  bookable?: boolean
  retired?: boolean
}

export interface Category {
  slug: string
  en: string
  ar: string
  /** Lucide icon name, used by web and mobile alike. */
  icon: string
  children: SubCategory[]
  retired?: boolean
}

export const TAXONOMY = [
  {
    slug: 'hospitality',
    en: 'Hospitality',
    ar: 'الضيافة',
    icon: 'bed-double',
    children: [
      { slug: 'hotels', en: 'Hotels', ar: 'فنادق', bookable: true },
      { slug: 'getaways', en: 'Getaways', ar: 'استراحات', bookable: true },
    ],
  },
  {
    slug: 'food-and-beverage',
    en: 'Food & Beverage',
    ar: 'المأكولات والمشروبات',
    icon: 'utensils',
    children: [
      { slug: 'restaurants', en: 'Restaurants', ar: 'مطاعم', bookable: true },
      { slug: 'cafes', en: 'Cafes', ar: 'مقاهي' },
      // Day pool-and-water resorts; see the importer's note on the Chouf file.
      { slug: 'pools', en: 'Pools', ar: 'مسابح' },
      { slug: 'nightlife', en: 'Nightlife', ar: 'الحياة الليلية' },
    ],
  },
  {
    slug: 'tourism',
    en: 'Tourism',
    ar: 'السياحة',
    icon: 'mountain-snow',
    children: [
      { slug: 'historic-sites', en: 'Historic Sites', ar: 'مواقع تاريخية' },
      { slug: 'guided-tours', en: 'Guided Tours', ar: 'جولات مع مرشد', bookable: true },
      { slug: 'festivals', en: 'Festivals', ar: 'مهرجانات' },
      { slug: 'activities', en: 'Activities', ar: 'أنشطة', bookable: true },
    ],
  },
  {
    slug: 'weddings',
    en: 'Weddings',
    ar: 'الأعراس',
    icon: 'heart',
    children: [
      { slug: 'event-planners', en: 'Event Planners', ar: 'منظمو مناسبات', bookable: true },
    ],
  },
  {
    slug: 'lifestyle',
    en: 'Lifestyle',
    ar: 'نمط الحياة',
    icon: 'sparkles',
    children: [
      { slug: 'malls', en: 'Malls', ar: 'مراكز تسوق' },
      { slug: 'gyms', en: 'Gyms', ar: 'نوادي رياضية' },
    ],
  },
  {
    slug: 'transportation',
    en: 'Transportation',
    ar: 'النقل',
    icon: 'car-front',
    children: [
      { slug: 'car-rental', en: 'Car Rental', ar: 'تأجير سيارات', bookable: true },
      {
        slug: 'airport-transfers',
        en: 'Airport Transfers',
        ar: 'نقل من وإلى المطار',
        bookable: true,
      },
      { slug: 'private-drivers', en: 'Private Drivers', ar: 'سائقون خاصون', bookable: true },
    ],
  },
] as const satisfies readonly Category[]

export type CategorySlug = (typeof TAXONOMY)[number]['slug']

/**
 * Widened view of the same data. `TAXONOMY` keeps literal types so slugs can be
 * used as a union; consumers that just want to iterate should use this, or
 * TypeScript will insist that optional fields like `retired` don't exist.
 */
export const CATEGORIES: readonly Category[] = TAXONOMY

/** Flat lookup of every subcategory slug to its parent category slug. */
export const SUBCATEGORY_PARENT: Record<string, CategorySlug> = Object.fromEntries(
  TAXONOMY.flatMap((category) =>
    category.children.map((child) => [child.slug, category.slug] as const),
  ),
)

export const CATEGORY_SLUGS: readonly string[] = TAXONOMY.map((c) => c.slug)

export function findCategory(slug: string): Category | undefined {
  return TAXONOMY.find((c) => c.slug === slug)
}

export function isActiveCategory(slug: string): boolean {
  const category = findCategory(slug)
  return category !== undefined && category.retired !== true
}

const SUBCATEGORIES: readonly SubCategory[] = CATEGORIES.flatMap((c) => c.children)

/** True for a kind of place that can take bookings through Vardenia. */
export function isBookableSubcategory(slug: string | null | undefined): boolean {
  if (!slug) return false
  const found = SUBCATEGORIES.find((child) => child.slug === slug)
  return found?.bookable === true && found.retired !== true
}

/**
 * Whether a listing filed under these kinds of place may turn booking on.
 *
 * One bookable kind is enough: a hotel that also runs a pool is still a hotel
 * that takes rooms.
 */
export function canTakeBookings(subcategories: readonly (string | null | undefined)[]): boolean {
  return subcategories.some(isBookableSubcategory)
}

/** True when any kind of place in this category can be booked. */
export function categoryTakesBookings(category: string | null | undefined): boolean {
  const found = category ? findCategory(category) : undefined
  return (found?.children ?? []).some((child) => isBookableSubcategory(child.slug))
}
