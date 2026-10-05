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
 * # The October 2026 list
 *
 * Six sections and nineteen kinds of place, down from seven and fifty-seven.
 * The long list described a directory Vardenia might one day have; this one
 * describes the one it has and sells. Everything that left is retired rather
 * than deleted, for the reason above and one more: each slug is a value in a
 * Postgres enum that old versions of listings still hold, and an enum value
 * cannot be dropped while a row uses it. See `SUBCATEGORY_MOVES` for where each
 * retired one's listings went.
 *
 * # Order is the enum's order
 *
 * New slugs sit where the migration that added them put them, beside the ones
 * they replace, so the generated enum and the database agree without the type
 * being rebuilt. Retired entries are skipped wherever a list is shown, so the
 * order a reader sees is the order of the live entries alone.
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
      { slug: 'luxury-hotels', en: 'Luxury Hotels', ar: 'فنادق فاخرة', retired: true },
      { slug: 'boutique-hotels', en: 'Boutique Hotels', ar: 'فنادق بوتيك', retired: true },
      { slug: 'apart-hotels', en: 'Apart Hotels', ar: 'شقق فندقية', retired: true },
      { slug: 'mountain-resorts', en: 'Mountain Resorts', ar: 'منتجعات جبلية', retired: true },
      { slug: 'beach-resorts', en: 'Beach Resorts', ar: 'منتجعات شاطئية', retired: true },
      { slug: 'guest-houses', en: 'Guest Houses', ar: 'بيوت ضيافة', retired: true },
      { slug: 'luxury-chalets', en: 'Luxury Chalets', ar: 'شاليهات فاخرة', retired: true },
      { slug: 'private-villas', en: 'Private Villas', ar: 'فلل خاصة', retired: true },
    ],
  },
  {
    slug: 'food-and-beverage',
    en: 'Food & Beverage',
    ar: 'المأكولات والمشروبات',
    icon: 'utensils',
    children: [
      { slug: 'restaurants', en: 'Restaurants', ar: 'مطاعم', bookable: true },
      { slug: 'fine-dining', en: 'Fine Dining', ar: 'مطاعم راقية', retired: true },
      {
        slug: 'lebanese-cuisine',
        en: 'Traditional Lebanese Cuisine',
        ar: 'المطبخ اللبناني',
        retired: true,
      },
      { slug: 'coffee-shops', en: 'Cafes', ar: 'مقاهي' },
      { slug: 'sunset-lounges', en: 'Sunset Lounges', ar: 'صالات الغروب', retired: true },
      // Day pool-and-water resorts. They were filed as beach clubs, which most of
      // them are not; see the importer's note on the Chouf file.
      { slug: 'pools', en: 'Pools', ar: 'مسابح' },
      { slug: 'beach-clubs', en: 'Beach Clubs', ar: 'نوادي شاطئية', retired: true },
      { slug: 'nightlife', en: 'Nightlife', ar: 'الحياة الليلية' },
      { slug: 'wine-experiences', en: 'Wine Experiences', ar: 'تجارب النبيذ', retired: true },
    ],
  },
  {
    slug: 'tourism',
    en: 'Tourism',
    ar: 'السياحة',
    icon: 'mountain-snow',
    children: [
      { slug: 'historical-sites', en: 'Historic Sites', ar: 'مواقع تاريخية' },
      { slug: 'rural-tourism', en: 'Rural Tourism', ar: 'السياحة الريفية', retired: true },
      { slug: 'eco-tourism', en: 'Eco Tourism', ar: 'السياحة البيئية', retired: true },
      {
        slug: 'summer-destinations',
        en: 'Summer Destinations',
        ar: 'وجهات صيفية',
        retired: true,
      },
      {
        slug: 'winter-destinations',
        en: 'Winter Destinations',
        ar: 'وجهات شتوية',
        retired: true,
      },
      { slug: 'mountain-escapes', en: 'Mountain Escapes', ar: 'استراحات جبلية', retired: true },
      { slug: 'hidden-villages', en: 'Hidden Villages', ar: 'قرى مخفية', retired: true },
      { slug: 'adventure', en: 'Adventure Experiences', ar: 'تجارب المغامرة', retired: true },
      // Added for the Keserwan directory, which has 17 guides and 12 festivals
      // and nothing here that described either.
      { slug: 'tour-guides', en: 'Guided Tours', ar: 'جولات مع مرشد', bookable: true },
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
      { slug: 'wedding-venues', en: 'Wedding Venues', ar: 'قاعات أفراح', retired: true },
      // The slug predates the broader name. It is the only kind of place left in
      // the section, and nothing was ever filed under it, but a slug that has
      // shipped stays.
      { slug: 'wedding-planners', en: 'Event Planners', ar: 'منظمو مناسبات', bookable: true },
      { slug: 'photographers', en: 'Photographers', ar: 'مصورون', retired: true },
      { slug: 'catering', en: 'Catering', ar: 'تقديم الطعام', retired: true },
      { slug: 'luxury-cars', en: 'Luxury Cars', ar: 'سيارات فاخرة', retired: true },
      { slug: 'flowers', en: 'Flowers', ar: 'أزهار', retired: true },
      { slug: 'bridal-fashion', en: 'Bridal Fashion', ar: 'أزياء العرائس', retired: true },
      { slug: 'formal-wear', en: "Men's Formal Wear", ar: 'أزياء رجالية رسمية', retired: true },
      { slug: 'beauty-salons', en: 'Beauty Salons', ar: 'صالونات تجميل', retired: true },
      { slug: 'entertainment', en: 'Entertainment', ar: 'ترفيه', retired: true },
    ],
  },
  {
    slug: 'lifestyle',
    en: 'Lifestyle',
    ar: 'نمط الحياة',
    icon: 'sparkles',
    children: [
      { slug: 'luxury-shopping', en: 'Luxury Shopping', ar: 'تسوق فاخر', retired: true },
      { slug: 'malls', en: 'Malls', ar: 'مراكز تسوق' },
      { slug: 'gyms', en: 'Gyms', ar: 'نوادي رياضية' },
      { slug: 'jewelry', en: 'Jewelry', ar: 'مجوهرات', retired: true },
      { slug: 'fashion', en: 'Fashion', ar: 'أزياء', retired: true },
      { slug: 'beauty', en: 'Beauty', ar: 'تجميل', retired: true },
      { slug: 'grooming', en: "Men's Grooming", ar: 'العناية بالرجل', retired: true },
      { slug: 'souvenirs', en: 'Souvenirs', ar: 'هدايا تذكارية', retired: true },
      { slug: 'luxury-experiences', en: 'Luxury Experiences', ar: 'تجارب فاخرة', retired: true },
    ],
  },
  {
    // Retired with every child. No listing was ever filed here once the gyms
    // moved to Lifestyle, and the section is gone from the site.
    slug: 'healthcare',
    en: 'Healthcare',
    ar: 'الرعاية الصحية',
    icon: 'stethoscope',
    retired: true,
    children: [
      { slug: 'hospitals', en: 'Hospitals', ar: 'مستشفيات', retired: true },
      { slug: 'medical-centers', en: 'Medical Centers', ar: 'مراكز طبية', retired: true },
      { slug: 'pharmacies', en: 'Pharmacies', ar: 'صيدليات', retired: true },
      { slug: 'medical-tourism', en: 'Medical Tourism', ar: 'السياحة العلاجية', retired: true },
      { slug: 'wellness', en: 'Wellness', ar: 'العافية', retired: true },
      { slug: 'spa-centers', en: 'Spa Centers', ar: 'مراكز سبا', retired: true },
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
      { slug: 'private-chauffeurs', en: 'Private Drivers', ar: 'سائقون خاصون', bookable: true },
      { slug: 'luxury-transportation', en: 'Luxury Transportation', ar: 'نقل فاخر', retired: true },
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

/** True for a subcategory that exists and has not been retired. */
export function isActiveSubcategory(slug: string): boolean {
  const found = SUBCATEGORIES.find((child) => child.slug === slug)
  return found !== undefined && found.retired !== true
}

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

/** True when any live kind of place in this category can be booked. */
export function categoryTakesBookings(category: string | null | undefined): boolean {
  const found = category ? findCategory(category) : undefined
  return (found?.children ?? []).some((child) => isBookableSubcategory(child.slug))
}

/**
 * Where each retired subcategory's listings went, for an old link that still
 * names one: `/stay?filter=boutique-hotels` opens Hotels rather than an empty
 * page. The October 2026 migration moved the rows by the same table; it carries
 * its own frozen copy, because a migration must not change when this does.
 *
 * Retired slugs that had nothing filed under them have no entry, and a link to
 * one falls back to the whole section.
 */
export const SUBCATEGORY_MOVES: Readonly<Record<string, string>> = {
  'luxury-hotels': 'hotels',
  'boutique-hotels': 'hotels',
  'apart-hotels': 'hotels',
  'mountain-resorts': 'getaways',
  'beach-resorts': 'getaways',
  'guest-houses': 'getaways',
  'luxury-chalets': 'getaways',
  'private-villas': 'getaways',
  'fine-dining': 'restaurants',
  'lebanese-cuisine': 'restaurants',
  'sunset-lounges': 'nightlife',
  'beach-clubs': 'pools',
  'wine-experiences': 'activities',
  'rural-tourism': 'activities',
  'eco-tourism': 'activities',
  'summer-destinations': 'activities',
  'winter-destinations': 'activities',
  'mountain-escapes': 'activities',
  'hidden-villages': 'activities',
  adventure: 'activities',
  'luxury-shopping': 'malls',
  wellness: 'gyms',
  'luxury-transportation': 'private-chauffeurs',
}

/** The live slug for one that may have been retired, or null if it has no home. */
export function currentSubcategory(slug: string | null | undefined): string | null {
  if (!slug) return null
  if (isActiveSubcategory(slug)) return slug
  return SUBCATEGORY_MOVES[slug] ?? null
}
