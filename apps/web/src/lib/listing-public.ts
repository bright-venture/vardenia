import {
  CONTACT_FIELDS,
  HOTEL_FACILITIES,
  PROPERTY_HIGHLIGHTS,
  SOCIAL_FIELDS,
  STAY_FEATURES,
  STAY_PACKAGE_UNITS,
  canHaveRoomTypes,
  checkContactValue,
  isWholePropertyStay,
  seatingAreasOf,
  stayHasContent,
  stayMinNights,
  type ContactField,
  type SeatingAreaKey,
  type StayFeature,
  type StayPackageUnit,
} from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'

/**
 * What the public listing page shows of the fields Tasks 2 to 8 added: contact
 * links, hotel facilities, guest house features and stay prices, restaurant
 * seating areas, and what the booking panel offers (packages, areas).
 *
 * Pure functions over the document as Payload returns it, so the empty cases
 * ("render nothing when a field is empty") are tested rather than hoped for.
 */

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export interface ContactLink {
  field: ContactField
  /** The visible text: the number, the address, or the network's own name's handle. */
  text: string
  /** The link target. Only ever tel:, https: or mailto:. */
  href: string
}

/** Shown beside a phone number or address; a social link shows its network instead. */
const hostOf = (href: string): string => {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}

/**
 * The listing's contact details as links, in a fixed order. A value that the
 * contact rules refuse (a stray `javascript:` string typed before the rules
 * existed) is dropped rather than linked, whatever is stored.
 */
export function contactLinks(contact: unknown): ContactLink[] {
  if (!isRecord(contact)) return []
  const links: ContactLink[] = []
  for (const field of CONTACT_FIELDS) {
    const value = text(contact[field])
    if (!value || !checkContactValue(field, value).ok) continue
    if (field === 'phone') {
      links.push({ field, text: value, href: `tel:${value.replace(/[^\d+]/g, '')}` })
    } else if (field === 'whatsapp') {
      const digits = value.replace(/\D/g, '')
      if (digits) links.push({ field, text: value, href: `https://wa.me/${digits}` })
    } else if (field === 'email') {
      links.push({ field, text: value, href: `mailto:${value}` })
    } else if ((SOCIAL_FIELDS as readonly string[]).includes(field)) {
      // A handle was turned into a full link on save; anything else not
      // https is not linked.
      if (/^https:\/\//i.test(value)) links.push({ field, text: hostOf(value), href: value })
    }
  }
  return links
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

const labelFor = (
  list: readonly { slug: string; en: string; ar: string }[],
  slug: string,
  locale: Locale,
): string => {
  const found = list.find((entry) => entry.slug === slug)
  if (!found) return slug
  // Arabic and English are curated; the other eight languages read English,
  // like governorates and cities (lib/labels).
  return locale === 'ar' ? found.ar : found.en
}

export interface HotelFacilitiesView {
  highlights: string[]
  popular: string[]
  /** The rest of the facilities, those not already shown as popular. */
  others: string[]
}

/** Hotel facilities, popular ones first and not repeated. Null when nothing is set. */
export function hotelFacilitiesView(
  listing: {
    subcategories?: unknown
    facilities?: unknown
    popularFacilities?: unknown
    propertyHighlights?: unknown
  },
  locale: Locale,
): HotelFacilitiesView | null {
  if (!canHaveRoomTypes(strings(listing.subcategories))) return null
  const all = strings(listing.facilities)
  const popularSlugs = strings(listing.popularFacilities)
  const highlights = strings(listing.propertyHighlights).map((slug) =>
    labelFor(PROPERTY_HIGHLIGHTS, slug, locale),
  )
  const popular = popularSlugs.map((slug) => labelFor(HOTEL_FACILITIES, slug, locale))
  const others = all
    .filter((slug) => !popularSlugs.includes(slug))
    .map((slug) => labelFor(HOTEL_FACILITIES, slug, locale))
  if (highlights.length === 0 && popular.length === 0 && others.length === 0) return null
  return { highlights, popular, others }
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export interface StayPackageView {
  id: string
  label: string
  description: string | null
  price: number
  unit: StayPackageUnit
}

/** The packages a guest can pick: active, named, priced. */
export function stayPackagesOf(stay: unknown): StayPackageView[] {
  if (!isRecord(stay) || !Array.isArray(stay.packages)) return []
  const out: StayPackageView[] = []
  for (const raw of stay.packages) {
    if (!isRecord(raw) || raw.active === false) continue
    const id = text(raw.id)
    const label = text(raw.label)
    const price = num(raw.price)
    if (!id || !label || price === null) continue
    const unit = (STAY_PACKAGE_UNITS as readonly string[]).includes(String(raw.unit))
      ? (raw.unit as StayPackageUnit)
      : 'per-stay'
    out.push({ id, label, description: text(raw.description), price, unit })
  }
  return out
}

export interface StayFactsView {
  nightlyPrice: number | null
  extraGuestFee: number | null
  includedGuests: number | null
  maxGuests: number | null
  minNights: number | null
  childrenCountAsGuests: boolean
  packages: StayPackageView[]
  features: StayFeature[]
}

/**
 * A guest house's stay pricing and features for the page, or null when there is
 * nothing to say. Only for Getaways: the `stay` group is only valid there, so
 * anything on another kind of listing is stale and is not shown.
 */
export function stayFactsView(listing: {
  subcategories?: unknown
  stay?: unknown
  features?: unknown
}): StayFactsView | null {
  if (!isWholePropertyStay(strings(listing.subcategories))) return null
  const stay = isRecord(listing.stay) ? listing.stay : null
  const features = isRecord(listing.features) ? listing.features : null
  const ticked = STAY_FEATURES.filter((name) => features?.[name] === true)
  const hasStay = stayHasContent(stay as never)
  if (!hasStay && ticked.length === 0) return null
  const fee = num(stay?.extraGuestFee)
  const minNights = stay ? stayMinNights(stay as never) : 1
  return {
    nightlyPrice: num(stay?.nightlyPrice),
    extraGuestFee: fee !== null && fee > 0 ? fee : null,
    includedGuests: num(stay?.includedGuests),
    maxGuests: num(stay?.maxGuests),
    minNights: minNights > 1 ? minNights : null,
    childrenCountAsGuests: stay?.childrenCountAsGuests !== false,
    packages: stayPackagesOf(stay),
    features: ticked,
  }
}

export interface SeatingAreaView {
  key: SeatingAreaKey
  setting: 'indoor' | 'outdoor'
  smoking: boolean
  /** The owner's own name for the area, in the page language, when given. */
  label: string | null
}

/** A restaurant's seating areas, in the owner's order. Table counts are not shown. */
export function seatingAreaViews(listing: {
  subcategories?: unknown
  seatingAreas?: unknown
}): SeatingAreaView[] {
  return seatingAreasOf({
    subcategories: strings(listing.subcategories),
    seatingAreas: Array.isArray(listing.seatingAreas) ? listing.seatingAreas : null,
  }).map((area) => ({
    key: area.key,
    setting: area.setting,
    smoking: area.smoking,
    label: area.label,
  }))
}

/** What the booking panel offers on top of the date, time and party. */
export interface BookingExtrasConfig {
  areas: SeatingAreaView[]
  packages: StayPackageView[]
}

export function bookingExtrasOf(listing: {
  subcategories?: unknown
  seatingAreas?: unknown
  stay?: unknown
}): BookingExtrasConfig | null {
  const areas = seatingAreaViews(listing)
  const wholeProperty = isWholePropertyStay(strings(listing.subcategories))
  const packages = wholeProperty ? stayPackagesOf(listing.stay) : []
  // A guest house always gets the panel's total (the quote says when there is
  // no price); a restaurant only when it has areas to choose from.
  return areas.length > 0 || wholeProperty ? { areas, packages } : null
}
