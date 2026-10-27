/**
 * Where a listing is, used for directory filtering and for the "explore by
 * region" browse experience.
 *
 * # Regions, not the official governorates
 *
 * The seven regions are the magazine's own: one per regional edition, the
 * Region column of the magazine entries sheet. They are what readers see in
 * print, so the site groups places the same way. Lebanon's official map has
 * nine governorates and draws the lines elsewhere (Aley and Baabda are in
 * Mount Lebanon, Akkar and Baalbek-Hermel are governorates of their own); here
 * each district sits in the region whose edition carries it.
 *
 * The names are the sheet's own (North, Bekaa, Jnoub), as printed. The slugs
 * stay plain-English and URL-safe, because they are stored values and appear
 * in filter links. The field and the type keep the name `governorate`, because
 * that is the database column. Its options are these seven.
 *
 * Two levels only - region and district (qada). Towns are NOT modelled here: a
 * listing carries its own address + lat/lng, and "near me" queries run against
 * PostGIS rather than a town lookup table.
 */

export interface District {
  slug: string
  en: string
  ar: string
}

export interface Governorate {
  slug: string
  en: string
  ar: string
  districts: District[]
}

export const GOVERNORATES = [
  {
    slug: 'beirut',
    en: 'Beirut',
    ar: 'بيروت',
    districts: [{ slug: 'beirut', en: 'Beirut', ar: 'بيروت' }],
  },
  {
    slug: 'matn',
    en: 'Matn',
    ar: 'المتن',
    districts: [
      { slug: 'aley', en: 'Aley', ar: 'عاليه' },
      { slug: 'baabda', en: 'Baabda', ar: 'بعبدا' },
      { slug: 'matn', en: 'Matn', ar: 'المتن' },
    ],
  },
  {
    slug: 'keserwan',
    en: 'Keserwan',
    ar: 'كسروان',
    districts: [
      { slug: 'jbeil', en: 'Jbeil (Byblos)', ar: 'جبيل' },
      { slug: 'keserwan', en: 'Keserwan', ar: 'كسروان' },
    ],
  },
  {
    slug: 'north-lebanon',
    en: 'North',
    ar: 'الشمال',
    districts: [
      { slug: 'akkar', en: 'Akkar', ar: 'عكار' },
      { slug: 'batroun', en: 'Batroun', ar: 'البترون' },
      { slug: 'bsharri', en: 'Bsharri', ar: 'بشري' },
      { slug: 'koura', en: 'Koura', ar: 'الكورة' },
      { slug: 'miniyeh-danniyeh', en: 'Miniyeh-Danniyeh', ar: 'المنية الضنية' },
      { slug: 'tripoli', en: 'Tripoli', ar: 'طرابلس' },
      { slug: 'zgharta', en: 'Zgharta', ar: 'زغرتا' },
    ],
  },
  {
    slug: 'chouf',
    en: 'Chouf',
    ar: 'الشوف',
    districts: [{ slug: 'chouf', en: 'Chouf', ar: 'الشوف' }],
  },
  {
    slug: 'beqaa',
    en: 'Bekaa',
    ar: 'البقاع',
    districts: [
      { slug: 'baalbek', en: 'Baalbek', ar: 'بعلبك' },
      { slug: 'hermel', en: 'Hermel', ar: 'الهرمل' },
      { slug: 'rachaya', en: 'Rachaya', ar: 'راشيا' },
      { slug: 'western-beqaa', en: 'Western Beqaa', ar: 'البقاع الغربي' },
      { slug: 'zahle', en: 'Zahle', ar: 'زحلة' },
    ],
  },
  {
    slug: 'south-lebanon',
    en: 'Jnoub',
    ar: 'الجنوب',
    districts: [
      { slug: 'bint-jbeil', en: 'Bint Jbeil', ar: 'بنت جبيل' },
      { slug: 'hasbaya', en: 'Hasbaya', ar: 'حاصبيا' },
      { slug: 'jezzine', en: 'Jezzine', ar: 'جزين' },
      { slug: 'marjeyoun', en: 'Marjeyoun', ar: 'مرجعيون' },
      { slug: 'nabatieh', en: 'Nabatieh', ar: 'النبطية' },
      { slug: 'sidon', en: 'Sidon (Saida)', ar: 'صيدا' },
      { slug: 'tyre', en: 'Tyre (Sour)', ar: 'صور' },
    ],
  },
] as const satisfies readonly Governorate[]

export type GovernorateSlug = (typeof GOVERNORATES)[number]['slug']

/** Rough centre of Lebanon - the default map viewport before geolocation. */
export const LEBANON_CENTER = { lat: 33.8547, lng: 35.8623 } as const

/** Bounding box used to reject obviously-wrong coordinates on listing save. */
export const LEBANON_BOUNDS = {
  minLat: 33.05,
  maxLat: 34.7,
  minLng: 35.1,
  maxLng: 36.65,
} as const

export function isWithinLebanon(lat: number, lng: number): boolean {
  return (
    lat >= LEBANON_BOUNDS.minLat &&
    lat <= LEBANON_BOUNDS.maxLat &&
    lng >= LEBANON_BOUNDS.minLng &&
    lng <= LEBANON_BOUNDS.maxLng
  )
}
