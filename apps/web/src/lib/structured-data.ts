import type { Locale } from '@vardenia/i18n'
import { districtLabel, governorateLabel, priceLabel } from './labels'
import { resolveImage, type MediaField } from './media'

/**
 * Schema.org markup, emitted as JSON-LD.
 *
 * A crawler reading a listing page sees prose. This tells it, in a format it
 * parses directly, that the page is about a *hotel*, at *these coordinates*,
 * open *these hours*, in *this price band*. That is what produces the rich
 * results - hours, map pin, price - that make a directory listing worth having.
 *
 * Everything here is built from fields that already exist. Nothing is inferred
 * or invented: a listing with no address produces no `address` block rather than
 * an empty one, because structured data that overstates what you know is worse
 * than none. Google penalises markup that disagrees with the page.
 *
 * `telephone`, `email` and `sameAs` used to be here and are gone with the
 * contact fields themselves - bookings and enquiries go through Vardenia now,
 * so a listing holds no phone number, address book entry or social profile to
 * declare. That costs a little: `sameAs` is how Google ties a listing to the
 * business as a real-world entity. It is the price of the model, not an
 * oversight, and it is worth revisiting if listings ever carry a public profile
 * link again.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/**
 * Vardenia's categories mapped onto schema.org types.
 *
 * More specific is better - `Hotel` earns richer treatment than `LocalBusiness`
 * - but only where the mapping is actually true. `hospitality` covers resorts,
 * guest houses and chalets as well as hotels, so it maps to `LodgingBusiness`
 * rather than claiming every one of them is a `Hotel`.
 */
const SCHEMA_TYPE: Record<string, string> = {
  hospitality: 'LodgingBusiness',
  'food-and-beverage': 'FoodEstablishment',
  tourism: 'TouristAttraction',
  weddings: 'LocalBusiness',
  lifestyle: 'LocalBusiness',
  healthcare: 'MedicalBusiness',
  transportation: 'LocalBusiness',
}

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

type Json = Record<string, unknown>

/** Drops empty values, so no property is ever emitted with nothing behind it. */
function compact(obj: Json): Json {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v === null || v === undefined || v === '') return false
      if (Array.isArray(v) && v.length === 0) return false
      return true
    }),
  )
}

function absolute(path: string, locale: Locale): string {
  const prefix = locale === 'ar' ? '/ar' : ''
  return `${SITE}${prefix}${path}`
}

interface OpeningHour {
  day?: string | null
  opens?: string | null
  closes?: string | null
  closed?: boolean | null
}

/**
 * Closed days are emitted explicitly with identical opens and closes, which is
 * how schema.org expresses "shut" - omitting the day would read as "hours
 * unknown", and a reader turning up on a Monday to a closed restaurant is
 * exactly the failure this data is supposed to prevent.
 */
function openingHours(hours: OpeningHour[] | null | undefined): Json[] {
  if (!Array.isArray(hours)) return []

  return hours
    .filter((h) => h?.day && DAY_NAMES[h.day])
    .map((h) =>
      compact({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAY_NAMES[h.day as string]}`,
        opens: h.closed ? '00:00' : h.opens,
        closes: h.closed ? '00:00' : h.closes,
      }),
    )
    .filter((h) => h.opens && h.closes)
}

export interface ListingForSchema {
  name?: string | null
  slug?: string | null
  tagline?: string | null
  category?: string | null
  governorate?: string | null
  district?: string | null
  address?: string | null
  location?: unknown
  priceRange?: string | number | null
  heroImage?: MediaField
  openingHours?: OpeningHour[] | null
}

export function listingSchema(listing: ListingForSchema, locale: Locale): Json {
  const image = resolveImage(listing.heroImage, 'hero')

  // Payload stores a point as [longitude, latitude] - GeoJSON order, the
  // reverse of how everyone says it aloud. Getting this backwards puts a Beirut
  // hotel in the Indian Ocean, which is why the collection validates it too.
  const point = Array.isArray(listing.location) ? (listing.location as number[]) : null
  const [lng, lat] = point ?? []

  const street = listing.address || undefined
  const locality = districtLabel(listing.district, locale) || undefined
  const region = governorateLabel(listing.governorate, locale) || undefined

  const address = compact({
    '@type': 'PostalAddress',
    streetAddress: street,
    addressLocality: locality,
    addressRegion: region,
    addressCountry: 'LB',
  })

  // `@type` and the hardcoded country are always present, so counting keys does
  // not tell you whether the block says anything. Only emit it when at least one
  // real component of an address survived - "somewhere in Lebanon" is not an
  // address, and asserting it in markup is worse than staying quiet.
  const hasAddress = Boolean(street || locality || region)

  return compact({
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[listing.category ?? ''] ?? 'LocalBusiness',
    name: listing.name,
    description: listing.tagline,
    url: listing.slug ? absolute(`/directory/${listing.slug}`, locale) : undefined,
    image: image?.src,
    priceRange: priceLabel(listing.priceRange) ?? undefined,
    address: hasAddress ? address : undefined,
    geo:
      typeof lat === 'number' && typeof lng === 'number'
        ? { '@type': 'GeoCoordinates', latitude: lat, longitude: lng }
        : undefined,
    openingHoursSpecification: openingHours(listing.openingHours),
  })
}

export interface ArticleForSchema {
  title?: string | null
  slug?: string | null
  excerpt?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  heroImage?: MediaField
  author?: { name?: string | null } | null
}

export function articleSchema(article: ArticleForSchema, locale: Locale): Json {
  const image = resolveImage(article.heroImage, 'hero')

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    url: article.slug ? absolute(`/magazine/articles/${article.slug}`, locale) : undefined,
    image: image?.src,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    author: article.author?.name
      ? { '@type': 'Person', name: article.author.name }
      : { '@type': 'Organization', name: 'Vardenia' },
    publisher: {
      '@type': 'Organization',
      name: 'Vardenia',
      url: SITE,
    },
  })
}

/**
 * Identifies the publisher itself, so search engines can associate every page
 * with one entity rather than treating the site as unattributed pages.
 */
export function organizationSchema(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Vardenia',
    url: SITE,
    description: "Lebanon's tourism and lifestyle guide, in print and online.",
    areaServed: { '@type': 'Country', name: 'Lebanon' },
  }
}
