/**
 * Lebanon's administrative geography, used for directory filtering and for the
 * "explore by region" browse experience.
 *
 * Two levels only - governorate (muhafazah) and district (qada). Towns are NOT
 * modelled here: a listing carries its own address + lat/lng, and "near me"
 * queries run against PostGIS rather than a town lookup table.
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
    slug: 'mount-lebanon',
    en: 'Mount Lebanon',
    ar: 'جبل لبنان',
    districts: [
      { slug: 'aley', en: 'Aley', ar: 'عاليه' },
      { slug: 'baabda', en: 'Baabda', ar: 'بعبدا' },
      { slug: 'chouf', en: 'Chouf', ar: 'الشوف' },
      { slug: 'jbeil', en: 'Jbeil (Byblos)', ar: 'جبيل' },
      { slug: 'keserwan', en: 'Keserwan', ar: 'كسروان' },
      { slug: 'matn', en: 'Matn', ar: 'المتن' },
    ],
  },
  {
    slug: 'north-lebanon',
    en: 'North Lebanon',
    ar: 'لبنان الشمالي',
    districts: [
      { slug: 'batroun', en: 'Batroun', ar: 'البترون' },
      { slug: 'bsharri', en: 'Bsharri', ar: 'بشري' },
      { slug: 'koura', en: 'Koura', ar: 'الكورة' },
      { slug: 'miniyeh-danniyeh', en: 'Miniyeh-Danniyeh', ar: 'المنية الضنية' },
      { slug: 'tripoli', en: 'Tripoli', ar: 'طرابلس' },
      { slug: 'zgharta', en: 'Zgharta', ar: 'زغرتا' },
    ],
  },
  {
    slug: 'akkar',
    en: 'Akkar',
    ar: 'عكار',
    districts: [{ slug: 'akkar', en: 'Akkar', ar: 'عكار' }],
  },
  {
    slug: 'beqaa',
    en: 'Beqaa',
    ar: 'البقاع',
    districts: [
      { slug: 'rachaya', en: 'Rachaya', ar: 'راشيا' },
      { slug: 'western-beqaa', en: 'Western Beqaa', ar: 'البقاع الغربي' },
      { slug: 'zahle', en: 'Zahle', ar: 'زحلة' },
    ],
  },
  {
    slug: 'baalbek-hermel',
    en: 'Baalbek-Hermel',
    ar: 'بعلبك الهرمل',
    districts: [
      { slug: 'baalbek', en: 'Baalbek', ar: 'بعلبك' },
      { slug: 'hermel', en: 'Hermel', ar: 'الهرمل' },
    ],
  },
  {
    slug: 'south-lebanon',
    en: 'South Lebanon',
    ar: 'لبنان الجنوبي',
    districts: [
      { slug: 'jezzine', en: 'Jezzine', ar: 'جزين' },
      { slug: 'sidon', en: 'Sidon (Saida)', ar: 'صيدا' },
      { slug: 'tyre', en: 'Tyre (Sour)', ar: 'صور' },
    ],
  },
  {
    slug: 'nabatieh',
    en: 'Nabatieh',
    ar: 'النبطية',
    districts: [
      { slug: 'bint-jbeil', en: 'Bint Jbeil', ar: 'بنت جبيل' },
      { slug: 'hasbaya', en: 'Hasbaya', ar: 'حاصبيا' },
      { slug: 'marjeyoun', en: 'Marjeyoun', ar: 'مرجعيون' },
      { slug: 'nabatieh', en: 'Nabatieh', ar: 'النبطية' },
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
