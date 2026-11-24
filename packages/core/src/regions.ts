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
 * The names are the sheet's own (North, Bekaa), as printed, except the south:
 * the sheet's "Jnoub" reads as "South" on the site (11 November 2026). The slugs
 * stay plain-English and URL-safe, because they are stored values and appear
 * in filter links. The field and the type keep the name `governorate`, because
 * that is the database column. Its options are these seven.
 *
 * Two levels only - region and district. Since 24 November 2026 the districts
 * are the towns and places readers know (Jounieh, Faqra / Faraya, Deir el
 * Qamar), chosen by the owner, not the official qadas; they replaced the
 * separate Areas list. A listing carries its own address + lat/lng, and "near
 * me" queries run against PostGIS rather than a town lookup table.
 *
 * Slugs are stored values and appear in filter links (?district=jounieh). Some
 * keep an older slug under a new name (bsharri is Bcharre, sidon is Saida,
 * tyre is Sour, western-beqaa is West Bekaa) so links already shared still work.
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
      { slug: 'dbayeh', en: 'Dbayeh', ar: 'ضبية' },
      { slug: 'broummana', en: 'Broummana', ar: 'برمانا' },
      { slug: 'bikfaya', en: 'Bikfaya', ar: 'بكفيا' },
      { slug: 'baabda', en: 'Baabda', ar: 'بعبدا' },
      { slug: 'hammana', en: 'Hammana', ar: 'حمانا' },
      { slug: 'aley', en: 'Aley', ar: 'عاليه' },
      { slug: 'bassour', en: 'Bassour', ar: 'بسور' },
    ],
  },
  {
    slug: 'keserwan',
    en: 'Keserwan',
    ar: 'كسروان',
    districts: [
      { slug: 'jounieh', en: 'Jounieh', ar: 'جونية' },
      { slug: 'harissa', en: 'Harissa', ar: 'حريصا' },
      { slug: 'kaslik', en: 'Kaslik', ar: 'الكسليك' },
      { slug: 'ghazir', en: 'Ghazir', ar: 'غزير' },
      { slug: 'tabarja', en: 'Tabarja', ar: 'طبرجا' },
      { slug: 'faqra-faraya', en: 'Faqra / Faraya', ar: 'فقرا / فاريا' },
      { slug: 'jbeil', en: 'Jbeil', ar: 'جبيل' },
    ],
  },
  {
    slug: 'north-lebanon',
    en: 'North',
    ar: 'الشمال',
    districts: [
      { slug: 'batroun', en: 'Batroun', ar: 'البترون' },
      { slug: 'chekka', en: 'Chekka', ar: 'شكا' },
      { slug: 'koura', en: 'Koura', ar: 'الكورة' },
      { slug: 'tripoli', en: 'Tripoli', ar: 'طرابلس' },
      { slug: 'zgharta', en: 'Zgharta', ar: 'زغرتا' },
      { slug: 'bsharri', en: 'Bcharre', ar: 'بشري' },
      { slug: 'akkar', en: 'Akkar', ar: 'عكار' },
    ],
  },
  {
    slug: 'chouf',
    en: 'Chouf',
    ar: 'الشوف',
    districts: [
      { slug: 'deir-el-qamar', en: 'Deir el Qamar', ar: 'دير القمر' },
      { slug: 'beiteddine', en: 'Beiteddine', ar: 'بيت الدين' },
      { slug: 'baakline', en: 'Baakline', ar: 'بعقلين' },
      { slug: 'moukhtara', en: 'Moukhtara', ar: 'المختارة' },
      { slug: 'barouk', en: 'Barouk', ar: 'الباروك' },
      { slug: 'jiyeh', en: 'Jiyeh', ar: 'الجية' },
      { slug: 'damour', en: 'Damour', ar: 'الدامور' },
    ],
  },
  {
    slug: 'beqaa',
    en: 'Bekaa',
    ar: 'البقاع',
    districts: [
      { slug: 'zahle', en: 'Zahle', ar: 'زحلة' },
      { slug: 'baalbek', en: 'Baalbek', ar: 'بعلبك' },
      { slug: 'western-beqaa', en: 'West Bekaa', ar: 'البقاع الغربي' },
      { slug: 'hermel', en: 'Hermel', ar: 'الهرمل' },
      { slug: 'chtoura', en: 'Chtoura', ar: 'شتورة' },
      { slug: 'saghbine', en: 'Saghbine', ar: 'صغبين' },
      { slug: 'masnaa', en: 'Masnaa', ar: 'المصنع' },
    ],
  },
  {
    slug: 'south-lebanon',
    en: 'South',
    ar: 'الجنوب',
    districts: [
      { slug: 'sidon', en: 'Saida', ar: 'صيدا' },
      { slug: 'tyre', en: 'Sour', ar: 'صور' },
      { slug: 'jezzine', en: 'Jezzine', ar: 'جزين' },
    ],
  },
] as const satisfies readonly Governorate[]

export type GovernorateSlug = (typeof GOVERNORATES)[number]['slug']

/**
 * Other names for a district's place, so a town written another way finds its
 * district: the import reads the magazine sheet's Location column with it, and
 * migration 20261124_districts read each listing's address with this same list
 * (copied into it when it was written). Lowercase, as compared after
 * `placeKey`.
 */
export const DISTRICT_ALIASES: Readonly<Record<string, string>> = {
  byblos: 'jbeil',
  amchit: 'jbeil',
  faqra: 'faqra-faraya',
  fakra: 'faqra-faraya',
  faraya: 'faqra-faraya',
  kfardebian: 'faqra-faraya',
  ajaltoun: 'faqra-faraya',
  zouk: 'jounieh',
  'zouk mosbeh': 'jounieh',
  'zouk mikael': 'jounieh',
  adonis: 'jounieh',
  sarba: 'jounieh',
  jeita: 'jounieh',
  kfarhbab: 'ghazir',
  daraoun: 'harissa',
  daraaoun: 'harissa',
  bzoummar: 'harissa',
  bzommar: 'harissa',
  safra: 'tabarja',
  mayrouba: 'faqra-faraya',
  'nahr ibrahim': 'jbeil',
  bsharri: 'bsharri',
  bcharre: 'bsharri',
  bsharre: 'bsharri',
  'the cedars': 'bsharri',
  cedars: 'bsharri',
  ehden: 'zgharta',
  douma: 'batroun',
  anfeh: 'koura',
  amioun: 'koura',
  halba: 'akkar',
  'deir al qamar': 'deir-el-qamar',
  'maasser el chouf': 'barouk',
  brummana: 'broummana',
  'beit mery': 'broummana',
  'jal el dib': 'dbayeh',
  antelias: 'dbayeh',
  hazmieh: 'baabda',
  bhamdoun: 'aley',
  sawfar: 'aley',
  chtaura: 'chtoura',
  ksara: 'zahle',
  'west bekaa': 'western-beqaa',
  'western beqaa': 'western-beqaa',
  kefraya: 'western-beqaa',
  ammiq: 'western-beqaa',
  rashaya: 'western-beqaa',
  rachaya: 'western-beqaa',
  anjar: 'masnaa',
  sidon: 'sidon',
  saida: 'sidon',
  tyre: 'tyre',
  sour: 'tyre',
  naqoura: 'tyre',
}

/** A place name made comparable: lowercase, accents and punctuation gone. */
export function placeKey(name: string): string {
  return (
    name
      // Decomposed, so an accent becomes its own mark and the line below drops it.
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  )
}

/**
 * The district a place name belongs to, or null. Matches a district's own
 * name ("Jounieh", either half of "Faqra / Faraya") or an alias ("Byblos").
 * With a governorate, only that region's districts count, so a name can never
 * put a listing in another region.
 */
export function districtForPlace(
  name: string | null | undefined,
  governorate?: string,
): string | null {
  if (!name) return null
  const whole = districtForKey(placeKey(name), governorate)
  if (whole) return whole
  // "Faqra, Kfardebian", "Jbeil / Byblos", "Jounieh ↔️ Harissa": the first
  // part that names a district wins.
  for (const part of name.split(/[,/+&↔|]|\s-\s|\sand\s/)) {
    const found = districtForKey(placeKey(part), governorate)
    if (found) return found
  }
  return null
}

function districtForKey(key: string, governorate?: string): string | null {
  if (!key) return null
  const regions = GOVERNORATES.filter((g) => !governorate || g.slug === governorate)
  for (const region of regions) {
    for (const district of region.districts) {
      const names = [district.slug.replace(/-/g, ' '), ...district.en.split('/')].map(placeKey)
      if (names.includes(key)) return district.slug
    }
  }
  const alias = DISTRICT_ALIASES[key]
  if (alias && regions.some((g) => g.districts.some((d) => d.slug === alias))) return alias
  return null
}

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
