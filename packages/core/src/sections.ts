import type { CategorySlug } from './taxonomy'

/**
 * The six sections of the site, and the category each one is.
 *
 * # Why this exists
 *
 * The navigation and the database used to speak different languages. The sitemap
 * had Stay, Eat & Drink, Experiences and Plan; the database has seven category
 * slugs stamped onto every listing and into every printed QR code. Three
 * categories - weddings, lifestyle and healthcare - existed in the data, could
 * be sold to, and had nowhere in the navigation to live. A wedding venue could
 * have been given a printed code pointing at a section that did not exist, and
 * print cannot be recalled.
 *
 * So there is now exactly one section per category, and this file is the only
 * place the two vocabularies meet.
 *
 * # Why a Record and not an array
 *
 * `Record<CategorySlug, ...>` is the whole point. TypeScript refuses to compile
 * if a category is missing a section, so adding an eighth category to the
 * taxonomy breaks the build here rather than quietly producing a category no
 * navigation reaches. That is the failure this file was written to make
 * impossible, and a hand-written array would not prevent it.
 *
 * # Paths are not slugs, deliberately
 *
 * `/stay` reads better than `/hospitality` and is what a premium travel brand
 * would print. The slug stays `hospitality` because it is in the database and on
 * paper. The mapping is small, exhaustive and tested, so the readable URL costs
 * nothing in drift.
 *
 * # The Arabic labels
 *
 * Taken from the taxonomy rather than translated fresh, so they match what the
 * admin panel and the filters already say. "Stay" against الضيافة is a slightly
 * looser pairing than the English, and is worth a look from an Arabic speaker
 * before launch - but a reviewed label that is a little formal beats an invented
 * one that might be wrong.
 */

export interface SiteSection {
  /** URL segment, e.g. `stay` for /stay. Never the category slug. */
  path: string
  /** The category this section is. One per section, no overlap. */
  category: CategorySlug
  en: string
  ar: string
  /**
   * One line, for the menu that lists all six at once.
   *
   * Six names in a row tell a first-time visitor almost nothing - "Lifestyle"
   * and "Experiences" could be anything. These say what is actually behind each
   * one, in the words a reader would use rather than the taxonomy's.
   */
  descriptionEn: string
  descriptionAr: string
}

const BY_CATEGORY: Record<CategorySlug, Omit<SiteSection, 'category'>> = {
  hospitality: {
    path: 'stay',
    en: 'Stay',
    ar: 'الضيافة',
    descriptionEn: 'Hotels and getaways',
    descriptionAr: 'فنادق واستراحات',
  },
  'food-and-beverage': {
    path: 'eat-and-drink',
    en: 'Eat & Drink',
    ar: 'المأكولات والمشروبات',
    descriptionEn: 'Restaurants, cafes, pools and nightlife',
    descriptionAr: 'مطاعم ومقاهي ومسابح وحياة ليلية',
  },
  tourism: {
    path: 'experiences',
    en: 'Experiences',
    ar: 'السياحة',
    descriptionEn: 'Historic sites, guided tours, festivals and activities',
    descriptionAr: 'مواقع تاريخية وجولات مع مرشد ومهرجانات وأنشطة',
  },
  weddings: {
    path: 'weddings',
    en: 'Weddings',
    ar: 'الأعراس',
    descriptionEn: 'Event planners for the day itself',
    descriptionAr: 'منظمو مناسبات ليومكم الكبير',
  },
  lifestyle: {
    path: 'lifestyle',
    en: 'Lifestyle',
    ar: 'نمط الحياة',
    descriptionEn: 'Malls and gyms',
    descriptionAr: 'مراكز تسوق ونوادي رياضية',
  },
  healthcare: {
    path: 'health',
    en: 'Health',
    ar: 'الرعاية الصحية',
    descriptionEn: 'Hospitals, clinics, spas and medical travel',
    descriptionAr: 'مستشفيات وعيادات ومراكز سبا وسياحة علاجية',
  },
  transportation: {
    path: 'getting-around',
    en: 'Getting Around',
    ar: 'النقل',
    descriptionEn: 'Car rental, airport transfers and private drivers',
    descriptionAr: 'تأجير سيارات ونقل من المطار وسائقون خاصون',
  },
}

/**
 * Navigation order, which is not the taxonomy's order.
 *
 * Stay, Eat & Drink and Experiences come first because they are what a visitor
 * arrives looking for and where the listings are today. Getting Around is
 * something you need once you are here rather than something you browse, so
 * it sits at the end.
 *
 * Healthcare is not here: it was retired in October 2026, with every kind of
 * place in it, and its section went with it. Its entry stays in the record
 * above because the type demands one for every category slug, and the slug
 * stays in the taxonomy because old listing versions still carry it. Leaving
 * it out of this list is what takes /health off the site.
 */
const ORDER: readonly CategorySlug[] = [
  'hospitality',
  'food-and-beverage',
  'tourism',
  'weddings',
  'lifestyle',
  'transportation',
]

export const SECTIONS: readonly SiteSection[] = ORDER.map((category) => ({
  category,
  ...BY_CATEGORY[category],
}))

/** The section for a category, for building a link from a listing. */
export function sectionForCategory(category: string | null | undefined): SiteSection | null {
  if (!category) return null
  return SECTIONS.find((section) => section.category === category) ?? null
}

/**
 * The section at a URL path, or null.
 *
 * Null is what makes `/stayy` a 404 rather than an empty listing page. The route
 * is a top-level dynamic segment, so it sees every unmatched one-segment path
 * and has to reject anything that is not one of the six.
 */
export function sectionForPath(path: string | null | undefined): SiteSection | null {
  if (!path) return null
  return SECTIONS.find((section) => section.path === path) ?? null
}

/** Every section path, for static generation. */
export const SECTION_PATHS: readonly string[] = SECTIONS.map((section) => section.path)
