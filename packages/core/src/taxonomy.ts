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
 */

export interface SubCategory {
  slug: string
  en: string
  ar: string
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
      { slug: 'luxury-hotels', en: 'Luxury Hotels', ar: 'فنادق فاخرة' },
      { slug: 'boutique-hotels', en: 'Boutique Hotels', ar: 'فنادق بوتيك' },
      { slug: 'apart-hotels', en: 'Apart Hotels', ar: 'شقق فندقية' },
      { slug: 'mountain-resorts', en: 'Mountain Resorts', ar: 'منتجعات جبلية' },
      { slug: 'beach-resorts', en: 'Beach Resorts', ar: 'منتجعات شاطئية' },
      { slug: 'guest-houses', en: 'Guest Houses', ar: 'بيوت ضيافة' },
      { slug: 'luxury-chalets', en: 'Luxury Chalets', ar: 'شاليهات فاخرة' },
      { slug: 'private-villas', en: 'Private Villas', ar: 'فلل خاصة' },
    ],
  },
  {
    slug: 'food-and-beverage',
    en: 'Food & Beverage',
    ar: 'المأكولات والمشروبات',
    icon: 'utensils',
    children: [
      { slug: 'restaurants', en: 'Restaurants', ar: 'مطاعم' },
      { slug: 'fine-dining', en: 'Fine Dining', ar: 'مطاعم راقية' },
      { slug: 'lebanese-cuisine', en: 'Traditional Lebanese Cuisine', ar: 'المطبخ اللبناني' },
      { slug: 'coffee-shops', en: 'Coffee Shops', ar: 'مقاهي' },
      { slug: 'sunset-lounges', en: 'Sunset Lounges', ar: 'صالات الغروب' },
      { slug: 'beach-clubs', en: 'Beach Clubs', ar: 'نوادي شاطئية' },
      { slug: 'nightlife', en: 'Nightlife', ar: 'الحياة الليلية' },
      { slug: 'wine-experiences', en: 'Wine Experiences', ar: 'تجارب النبيذ' },
    ],
  },
  {
    slug: 'tourism',
    en: 'Tourism',
    ar: 'السياحة',
    icon: 'mountain-snow',
    children: [
      { slug: 'historical-sites', en: 'Historical Sites', ar: 'مواقع تاريخية' },
      { slug: 'rural-tourism', en: 'Rural Tourism', ar: 'السياحة الريفية' },
      { slug: 'eco-tourism', en: 'Eco Tourism', ar: 'السياحة البيئية' },
      { slug: 'summer-destinations', en: 'Summer Destinations', ar: 'وجهات صيفية' },
      { slug: 'winter-destinations', en: 'Winter Destinations', ar: 'وجهات شتوية' },
      { slug: 'mountain-escapes', en: 'Mountain Escapes', ar: 'استراحات جبلية' },
      { slug: 'hidden-villages', en: 'Hidden Villages', ar: 'قرى مخفية' },
      { slug: 'adventure', en: 'Adventure Experiences', ar: 'تجارب المغامرة' },
    ],
  },
  {
    slug: 'weddings',
    en: 'Weddings',
    ar: 'الأعراس',
    icon: 'heart',
    children: [
      { slug: 'wedding-venues', en: 'Wedding Venues', ar: 'قاعات أفراح' },
      { slug: 'wedding-planners', en: 'Wedding Planners', ar: 'منظمو حفلات الزفاف' },
      { slug: 'photographers', en: 'Photographers', ar: 'مصورون' },
      { slug: 'catering', en: 'Catering', ar: 'تقديم الطعام' },
      { slug: 'luxury-cars', en: 'Luxury Cars', ar: 'سيارات فاخرة' },
      { slug: 'flowers', en: 'Flowers', ar: 'أزهار' },
      { slug: 'bridal-fashion', en: 'Bridal Fashion', ar: 'أزياء العرائس' },
      { slug: 'formal-wear', en: "Men's Formal Wear", ar: 'أزياء رجالية رسمية' },
      { slug: 'beauty-salons', en: 'Beauty Salons', ar: 'صالونات تجميل' },
      { slug: 'entertainment', en: 'Entertainment', ar: 'ترفيه' },
    ],
  },
  {
    slug: 'lifestyle',
    en: 'Lifestyle',
    ar: 'نمط الحياة',
    icon: 'sparkles',
    children: [
      { slug: 'luxury-shopping', en: 'Luxury Shopping', ar: 'تسوق فاخر' },
      { slug: 'jewelry', en: 'Jewelry', ar: 'مجوهرات' },
      { slug: 'fashion', en: 'Fashion', ar: 'أزياء' },
      { slug: 'beauty', en: 'Beauty', ar: 'تجميل' },
      { slug: 'grooming', en: "Men's Grooming", ar: 'العناية بالرجل' },
      { slug: 'souvenirs', en: 'Souvenirs', ar: 'هدايا تذكارية' },
      { slug: 'luxury-experiences', en: 'Luxury Experiences', ar: 'تجارب فاخرة' },
    ],
  },
  {
    slug: 'healthcare',
    en: 'Healthcare',
    ar: 'الرعاية الصحية',
    icon: 'stethoscope',
    children: [
      { slug: 'hospitals', en: 'Hospitals', ar: 'مستشفيات' },
      { slug: 'medical-centers', en: 'Medical Centers', ar: 'مراكز طبية' },
      { slug: 'pharmacies', en: 'Pharmacies', ar: 'صيدليات' },
      { slug: 'medical-tourism', en: 'Medical Tourism', ar: 'السياحة العلاجية' },
      { slug: 'wellness', en: 'Wellness', ar: 'العافية' },
      { slug: 'spa-centers', en: 'Spa Centers', ar: 'مراكز سبا' },
    ],
  },
  {
    slug: 'transportation',
    en: 'Transportation',
    ar: 'النقل',
    icon: 'car-front',
    children: [
      { slug: 'car-rental', en: 'Car Rental', ar: 'تأجير سيارات' },
      { slug: 'airport-transfers', en: 'Airport Transfers', ar: 'نقل من وإلى المطار' },
      { slug: 'private-chauffeurs', en: 'Private Chauffeurs', ar: 'سائقون خاصون' },
      { slug: 'luxury-transportation', en: 'Luxury Transportation', ar: 'نقل فاخر' },
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
