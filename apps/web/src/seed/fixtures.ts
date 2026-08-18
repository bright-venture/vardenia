import type { ListingTier } from '@vardenia/core'

/**
 * The fixture set, as plain data.
 *
 * Separate from the code that inserts it so it can be checked without a
 * database - fixtures.test.ts asserts every category, subcategory, governorate
 * and district here is a real one, which is the way seed data usually rots. A
 * typo in a slug produces a listing that exists but matches no filter, and you
 * find out by browsing rather than by running anything.
 *
 * Chosen to span the axes the site actually branches on, not to be a long list:
 * every tier including free, four governorates, three top-level categories, one
 * business with no opening hours and one that closes on a Monday (the isOpenNow
 * edge cases), one unpublished draft, and one sponsored article. Anything that
 * renders differently should have an example here.
 *
 * These are real Lebanese places with approximate coordinates. Descriptions are
 * written for this file - do not treat them as copy anyone approved.
 */

export interface OpeningHour {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  opens?: string
  closes?: string
  closed?: boolean
}

export interface BusinessFixture {
  slug: string
  name: { en: string; ar: string }
  tagline: { en: string; ar: string }
  description: { en: string; ar: string }
  category: string
  subcategories: string[]
  governorate: string
  district: string
  address: { en: string; ar: string }
  location: [number, number]
  tier: ListingTier
  verified: boolean
  priceRange: '1' | '2' | '3' | '4'
  amenities: string[]
  phone: string
  website?: string
  openingHours: OpeningHour[]
  /** Commercial. Only ever visible to staff - see the Commercial tab. */
  contractStartsAt?: string
  contractEndsAt?: string
  internalNotes?: string
  status: 'published' | 'draft'
}

const WEEK: OpeningHour['day'][] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Same hours every day. Most listings are this shape. */
const daily = (opens: string, closes: string): OpeningHour[] =>
  WEEK.map((day) => ({ day, opens, closes, closed: false }))

/** Same, but shut on the given days - the case that breaks naive hour logic. */
const dailyExcept = (opens: string, closes: string, ...shut: OpeningHour['day'][]): OpeningHour[] =>
  WEEK.map((day) =>
    shut.includes(day) ? { day, closed: true } : { day, opens, closes, closed: false },
  )

export const BUSINESSES: BusinessFixture[] = [
  {
    slug: 'hotel-albergo',
    name: { en: 'Hotel Albergo', ar: 'فندق ألبرغو' },
    tagline: { en: 'A townhouse hotel in Achrafieh', ar: 'فندق في الأشرفية' },
    description: {
      en: 'A restored 1930s townhouse in Achrafieh with thirty-three suites, a rooftop pool and a courtyard restaurant. Member of Relais & Chateaux.',
      ar: 'منزل من ثلاثينيات القرن الماضي في الأشرفية، يضم ثلاثاً وثلاثين جناحاً ومسبحاً على السطح ومطعماً في الفناء.',
    },
    category: 'hospitality',
    subcategories: ['boutique-hotels', 'luxury-hotels'],
    governorate: 'beirut',
    district: 'beirut',
    address: {
      en: '137 Abdel Wahab El Inglizi Street, Achrafieh',
      ar: 'شارع عبد الوهاب الإنكليزي، الأشرفية',
    },
    location: [35.5199, 33.8886],
    tier: 'partner',
    verified: true,
    priceRange: '4',
    amenities: [
      'pool',
      'spa',
      'valet-parking',
      'accessible',
      'alcohol',
      'wifi',
      'air-conditioning',
    ],
    phone: '+961 1 339797',
    website: 'https://albergobeirut.com',
    openingHours: daily('00:00', '23:59'),
    contractStartsAt: '2026-01-15T00:00:00.000Z',
    contractEndsAt: '2027-01-15T00:00:00.000Z',
    internalNotes: 'Renewal handled by the GM directly. Prefers a call over email.',
    status: 'published',
  },
  {
    slug: 'em-sherif',
    name: { en: 'Em Sherif', ar: 'أم شريف' },
    tagline: { en: 'Set-menu Lebanese dining', ar: 'مطبخ لبناني بقائمة محددة' },
    description: {
      en: 'A single set menu of Lebanese classics served across many small plates, in a room of deep green and gold. Reservation essential.',
      ar: 'قائمة واحدة من الأطباق اللبنانية الكلاسيكية تقدم على شكل مازات كثيرة. الحجز ضروري.',
    },
    category: 'food-and-beverage',
    subcategories: ['fine-dining', 'lebanese-cuisine'],
    governorate: 'beirut',
    district: 'beirut',
    address: { en: 'Monot Street, Achrafieh', ar: 'شارع مونو، الأشرفية' },
    location: [35.5145, 33.8894],
    tier: 'featured',
    verified: true,
    priceRange: '4',
    amenities: ['valet-parking', 'alcohol', 'outdoor-seating', 'air-conditioning'],
    phone: '+961 1 322722',
    openingHours: dailyExcept('19:00', '23:30', 'mon'),
    contractStartsAt: '2026-03-01T00:00:00.000Z',
    contractEndsAt: '2026-09-01T00:00:00.000Z',
    internalNotes: 'Contract lapses in September. Chase in August.',
    status: 'published',
  },
  {
    slug: 'chateau-ksara',
    name: { en: 'Chateau Ksara', ar: 'شاتو كسارة' },
    tagline: { en: 'Lebanon oldest winery', ar: 'أقدم مصنع نبيذ في لبنان' },
    description: {
      en: 'Founded by Jesuit priests in 1857. Tours run through the Roman caves beneath the estate and finish with a tasting.',
      ar: 'تأسس على يد الآباء اليسوعيين عام 1857. تمر الجولات في المغاور الرومانية تحت الملكية وتنتهي بتذوق النبيذ.',
    },
    category: 'food-and-beverage',
    subcategories: ['wine-experiences'],
    governorate: 'beqaa',
    district: 'zahle',
    address: { en: 'Ksara, Zahle', ar: 'كسارة، زحلة' },
    location: [35.8903, 33.8225],
    tier: 'featured',
    verified: true,
    priceRange: '2',
    amenities: ['free-parking', 'alcohol', 'family-friendly', 'outdoor-seating'],
    phone: '+961 8 813495',
    website: 'https://chateauksara.com',
    openingHours: dailyExcept('09:00', '17:00', 'sun'),
    contractStartsAt: '2026-02-01T00:00:00.000Z',
    contractEndsAt: '2027-02-01T00:00:00.000Z',
    status: 'published',
  },
  {
    slug: 'mzaar-kfardebian',
    name: { en: 'Mzaar Kfardebian', ar: 'مزار كفردبيان' },
    tagline: {
      en: 'The largest ski area in the Middle East',
      ar: 'أكبر منطقة تزلج في الشرق الأوسط',
    },
    description: {
      en: 'Around eighty kilometres of piste between 1,850 and 2,465 metres, forty minutes from Beirut. Season usually runs December to April.',
      ar: 'نحو ثمانين كيلومتراً من المنحدرات بين 1850 و2465 متراً، على بعد أربعين دقيقة من بيروت.',
    },
    category: 'tourism',
    subcategories: ['winter-destinations', 'adventure', 'mountain-escapes'],
    governorate: 'mount-lebanon',
    district: 'keserwan',
    address: { en: 'Kfardebian, Keserwan', ar: 'كفردبيان، كسروان' },
    location: [35.8422, 34.0086],
    tier: 'listed',
    verified: false,
    priceRange: '3',
    amenities: ['free-parking', 'family-friendly', 'mountain-view'],
    phone: '+961 9 340101',
    // Deliberately empty: hours vary by season, which the Open now filter has to
    // handle without claiming the place is shut.
    openingHours: [],
    status: 'published',
  },
  {
    slug: 'byblos-old-souks',
    name: { en: 'Byblos Old Souks', ar: 'أسواق جبيل القديمة' },
    tagline: { en: 'Crusader-era lanes above the harbour', ar: 'أزقة من العهد الصليبي فوق المرفأ' },
    description: {
      en: 'Restored stone lanes running between the Crusader castle and the fishing port, lined with craft shops and cafes.',
      ar: 'أزقة حجرية مرممة تمتد بين القلعة الصليبية ومرفأ الصيد، تصطف على جانبيها متاجر الحرف والمقاهي.',
    },
    category: 'tourism',
    subcategories: ['historical-sites'],
    governorate: 'mount-lebanon',
    district: 'jbeil',
    address: { en: 'Old Souk, Byblos', ar: 'السوق القديم، جبيل' },
    location: [35.6519, 34.123],
    tier: 'free',
    verified: false,
    priceRange: '1',
    amenities: ['family-friendly', 'outdoor-seating', 'sea-view'],
    phone: '+961 9 540001',
    openingHours: daily('08:00', '20:00'),
    status: 'published',
  },
  {
    slug: 'beit-douma',
    name: { en: 'Beit Douma', ar: 'بيت دوما' },
    tagline: { en: 'A guest house in a hill village', ar: 'بيت ضيافة في قرية جبلية' },
    description: {
      en: 'Six rooms in a nineteenth-century house in Douma, with a shaded terrace over the valley.',
      ar: 'ست غرف في منزل من القرن التاسع عشر في دوما، مع شرفة مظللة تطل على الوادي.',
    },
    category: 'hospitality',
    subcategories: ['guest-houses'],
    governorate: 'north-lebanon',
    district: 'batroun',
    address: { en: 'Douma, Batroun', ar: 'دوما، البترون' },
    location: [35.8339, 34.2172],
    tier: 'free',
    verified: false,
    priceRange: '2',
    amenities: ['mountain-view', 'free-parking', 'pet-friendly'],
    phone: '+961 6 520200',
    openingHours: daily('08:00', '22:00'),
    // Draft on purpose: proves publishedOrStaff hides it from anonymous callers.
    status: 'draft',
  },
]

export interface ArticleFixture {
  slug: string
  title: { en: string; ar: string }
  excerpt: { en: string; ar: string }
  body: { en: string[]; ar: string[] }
  kind: 'feature' | 'guide' | 'interview' | 'itinerary' | 'news' | 'sponsored'
  category?: string
  governorate?: string
  publishedAt: string
  /** Business slugs, resolved to ids at insert time. */
  featured: string[]
  sponsoredBy?: string
  pageFrom?: number
  pageTo?: number
  status: 'published' | 'draft'
}

export const ARTICLES: ArticleFixture[] = [
  {
    slug: 'forty-eight-hours-in-beirut',
    title: { en: 'Forty-eight hours in Beirut', ar: 'ثمان وأربعون ساعة في بيروت' },
    excerpt: {
      en: 'A weekend built around Achrafieh, the corniche and one long dinner.',
      ar: 'عطلة نهاية أسبوع بين الأشرفية والكورنيش وعشاء طويل.',
    },
    body: {
      en: [
        'Beirut rewards a short stay more than most cities, because so little of it needs planning.',
        'Begin in Achrafieh. The streets above Sassine still carry the townhouses that gave the district its reputation, and the best of them have become hotels.',
        'Save the evening. Dinner here is not a course followed by a course; it arrives all at once and keeps arriving.',
      ],
      ar: [
        'تكافئ بيروت الإقامة القصيرة أكثر من معظم المدن، لأن القليل منها يحتاج إلى تخطيط.',
        'ابدأ من الأشرفية. لا تزال الشوارع فوق ساسين تحتفظ بالمنازل التي منحت المنطقة سمعتها.',
        'احتفظ بالمساء. العشاء هنا ليس طبقاً يتبعه طبق، بل يصل كله دفعة واحدة.',
      ],
    },
    kind: 'guide',
    category: 'tourism',
    governorate: 'beirut',
    publishedAt: '2026-06-01T09:00:00.000Z',
    featured: ['hotel-albergo', 'em-sherif'],
    pageFrom: 24,
    pageTo: 31,
    status: 'published',
  },
  {
    slug: 'the-cellars-of-the-beqaa',
    title: { en: 'The cellars of the Beqaa', ar: 'أقبية البقاع' },
    excerpt: {
      en: 'Two thousand years of winemaking, and the caves that survived the last hundred.',
      ar: 'ألفا عام من صناعة النبيذ، والمغاور التي نجت من المئة الأخيرة.',
    },
    body: {
      en: [
        'The valley has made wine since the Romans, who built a temple to Bacchus at Baalbek and were not being metaphorical.',
        'What survives underground is older than the estates above it. The Jesuits did not dig the caves at Ksara; they found them.',
      ],
      ar: [
        'صنع الوادي النبيذ منذ عهد الرومان، الذين بنوا معبداً لباخوس في بعلبك.',
        'ما بقي تحت الأرض أقدم مما فوقها. لم يحفر اليسوعيون مغاور كسارة، بل وجدوها.',
      ],
    },
    kind: 'feature',
    category: 'food-and-beverage',
    governorate: 'beqaa',
    publishedAt: '2026-06-15T09:00:00.000Z',
    featured: ['chateau-ksara'],
    pageFrom: 48,
    pageTo: 57,
    status: 'published',
  },
  {
    slug: 'a-season-on-the-mountain',
    title: { en: 'A season on the mountain', ar: 'موسم على الجبل' },
    excerpt: {
      en: 'Forty minutes from the sea, the season runs December to April.',
      ar: 'على بعد أربعين دقيقة من البحر، يمتد الموسم من كانون الأول إلى نيسان.',
    },
    body: {
      en: [
        'The drive climbs two thousand metres in under an hour, which is the detail every visitor repeats afterwards.',
        'Snow cover has become less reliable over the last decade. The upper pistes hold it longest.',
      ],
      ar: [
        'يرتفع الطريق ألفي متر في أقل من ساعة، وهي التفصيلة التي يكررها كل زائر بعد ذلك.',
        'أصبح الغطاء الثلجي أقل ثباتاً خلال العقد الأخير. تحتفظ به المنحدرات العليا لأطول فترة.',
      ],
    },
    kind: 'sponsored',
    category: 'tourism',
    governorate: 'mount-lebanon',
    publishedAt: '2026-07-01T09:00:00.000Z',
    featured: ['mzaar-kfardebian'],
    sponsoredBy: 'mzaar-kfardebian',
    pageFrom: 62,
    pageTo: 69,
    status: 'published',
  },
]

export interface IssueFixture {
  slug: string
  title: { en: string; ar: string }
  season: { en: string; ar: string }
  issueNumber: number
  publishedAt: string
  pageCount: number
  printRun: number
}

export const ISSUES: IssueFixture[] = [
  {
    slug: 'summer-2026',
    title: { en: 'Summer 2026', ar: 'صيف 2026' },
    season: { en: 'Summer 2026', ar: 'صيف 2026' },
    issueNumber: 1,
    publishedAt: '2026-05-20T00:00:00.000Z',
    pageCount: 132,
    printRun: 15000,
  },
]

/** Cities scan events are attributed to, weighted roughly by real traffic. */
export const SCAN_CITIES: { city: string; country: string; weight: number }[] = [
  { city: 'Beirut', country: 'LB', weight: 40 },
  { city: 'Jounieh', country: 'LB', weight: 10 },
  { city: 'Zahle', country: 'LB', weight: 8 },
  { city: 'Tripoli', country: 'LB', weight: 6 },
  { city: 'Byblos', country: 'LB', weight: 6 },
  { city: 'Paris', country: 'FR', weight: 8 },
  { city: 'Dubai', country: 'AE', weight: 7 },
  { city: 'London', country: 'GB', weight: 5 },
  { city: 'Riyadh', country: 'SA', weight: 5 },
  { city: 'Montreal', country: 'CA', weight: 5 },
]

/** Every slug the seed owns, so reset removes exactly what it created. */
export const SEEDED_SLUGS = {
  businesses: BUSINESSES.map((b) => b.slug),
  articles: ARTICLES.map((a) => a.slug),
  issues: ISSUES.map((i) => i.slug),
}

/** Uploaded files are prefixed with this so reset can find them. */
export const MEDIA_PREFIX = 'seed-'
