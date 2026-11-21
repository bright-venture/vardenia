import { isWholePropertyStay } from './taxonomy'

/**
 * Guest houses sold as a whole property (Task 6, 20 November 2026).
 *
 * A getaway is booked whole: one stay at a time, for some nights. The owner
 * sets a nightly price that covers a number of guests, a fee per extra guest
 * per night, an optional hard cap on guests, a minimum number of nights, and
 * optional packages that replace the nightly price (a weekend with breakfast,
 * an event day). This file is the pure part: the shape, the checks Payload
 * runs on save, and the quote. Money is USD with at most two decimals.
 *
 * # The quote
 *
 *  - guests counted = adults, plus children when `childrenCountAsGuests`
 *    (the default);
 *  - extra guests = max(0, guests - includedGuests); no included count means
 *    everyone is included;
 *  - the base is the nightly price x nights, or a package instead, by its
 *    unit: per night (x nights), per stay (once), per person per night
 *    (x guests x nights);
 *  - the extra-guest fee is charged per extra guest per night on top of the
 *    nightly price and of a per-night or per-stay package, but NOT on a
 *    per-person-per-night package, which already charges every guest (ruling,
 *    20 November 2026: charging extra guests again would bill them twice);
 *  - each line is rounded half away from zero to cents, and the total is the
 *    sum of the rounded lines (rounded again only to clean up float noise).
 *
 * Refused: inputs that are not whole numbers 0 or more ('invalid-input':
 * NaN, Infinity, negative or fractional nights, adults or children), fewer
 * nights than `minNights` (default 1), more counted guests than
 * `maxGuests` (only when set), a package id that is not on the listing, an
 * inactive package, and nothing to price with ('no-price': no nightly price
 * and no package, or a package without a price). Task 7 stores no price
 * snapshot for 'no-price'; it never becomes a zero total.
 */

export const STAY_PACKAGE_UNITS = ['per-night', 'per-stay', 'per-person-per-night'] as const
export type StayPackageUnit = (typeof STAY_PACKAGE_UNITS)[number]

export const MAX_STAY_PACKAGES = 10

/** The optional features of a guest house, each a checkbox on the listing. */
export const STAY_FEATURES = [
  'musicAllowed',
  'eventsHosted',
  'partiesAllowed',
  'gardenAccess',
  'barbecue',
  'pool',
] as const
export type StayFeature = (typeof STAY_FEATURES)[number]

export interface StayPackage {
  /** Payload's row id, stable across saves. */
  id?: string | null
  label?: unknown
  description?: unknown
  price?: number | null
  unit?: StayPackageUnit | null
  /** Absent means active (the field defaults to true). */
  active?: boolean | null
}

/** The `stay` group of a listing, as Payload returns it. Every field may be empty. */
export interface StayConfig {
  nightlyPrice?: number | null
  includedGuests?: number | null
  maxGuests?: number | null
  extraGuestFee?: number | null
  childrenCountAsGuests?: boolean | null
  minNights?: number | null
  packages?: StayPackage[] | null
}

export type StayFeatures = Partial<Record<StayFeature, boolean | null>>

export type StayRefusal =
  | 'invalid-input'
  | 'below-min-nights'
  | 'above-max-guests'
  | 'unknown-package'
  | 'inactive-package'
  | 'no-price'

export interface StayQuoteLine {
  kind: 'nightly' | 'package' | 'extra-guests'
  /** The package's row id, on a package line. */
  packageId?: string
  unit?: StayPackageUnit
  unitPrice: number
  /** Nights; 1 for a per-stay package; guests x nights; extra guests x nights. */
  quantity: number
  /** unitPrice x quantity, rounded to cents. */
  amount: number
}

export type StayQuote =
  | {
      ok: true
      total: number
      currency: 'USD'
      nights: number
      guests: number
      extraGuests: number
      lines: StayQuoteLine[]
    }
  | { ok: false; reason: StayRefusal }

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Round to cents, half away from zero: 1.005 -> 1.01, -0.125 -> -0.13.
 *
 * Binary floats store 1.005 as 1.00499999..., so `Math.round(x * 100)` gives
 * 1.00. The value is first cut to 15 significant digits (what a decimal
 * price really was), then shifted by two decimal places in its string form,
 * which is exact.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return value
  const abs = Number(Math.abs(value).toPrecision(15))
  // Below half a cent rounds to 0; huge numbers have no cents left to round.
  if (abs < 0.005) return 0
  if (abs >= 1e15) return value
  const cents = Math.round(Number(`${abs}e2`))
  const rounded = Number(`${cents}e-2`)
  return value < 0 ? -rounded : rounded
}

/** Adults, plus children unless the owner said children do not count. */
export function countedGuests(
  adults: number,
  children: number,
  childrenCountAsGuests: boolean | null | undefined,
): number {
  const a = Math.max(0, Math.floor(finite(adults) ? adults : 0))
  const c = Math.max(0, Math.floor(finite(children) ? children : 0))
  return childrenCountAsGuests === false ? a : a + c
}

/**
 * A party split into adults and children: at least one adult, children never
 * more than the party less that adult, never negative. The one rule the
 * booking service and the booking guard both apply (Task 6 review).
 */
export function splitParty(
  partySize: number,
  children: number | null | undefined,
): { adults: number; children: number } {
  const party = Math.max(1, Math.floor(finite(partySize) ? partySize : 1))
  const asked = Math.floor(finite(children) ? children : 0)
  const kids = Math.max(0, Math.min(asked, party - 1))
  return { adults: party - kids, children: kids }
}

const wholeCount = (value: unknown): boolean =>
  finite(value) && Number.isInteger(value) && value >= 0

/** The minimum stay in nights: a positive whole number, 1 when unset. */
export function stayMinNights(stay: StayConfig | null | undefined): number {
  const n = stay?.minNights
  return finite(n) && n >= 1 ? Math.floor(n) : 1
}

/** The hard cap on counted guests, or null when the owner set none. */
export function stayMaxGuests(stay: StayConfig | null | undefined): number | null {
  const n = stay?.maxGuests
  return finite(n) && n >= 1 ? Math.floor(n) : null
}

export interface StayRequest {
  nights: number
  adults: number
  children?: number
  stay: StayConfig | null | undefined
}

/**
 * The limits a booking must meet, whatever it costs: enough nights, not too
 * many guests. The booking service and the booking guard use this; the quote
 * starts with it.
 */
export function stayLimitProblem({
  nights,
  adults,
  children = 0,
  stay,
}: StayRequest): 'below-min-nights' | 'above-max-guests' | null {
  if (!finite(nights) || !Number.isInteger(nights) || nights < stayMinNights(stay)) {
    return 'below-min-nights'
  }
  const max = stayMaxGuests(stay)
  if (max !== null && countedGuests(adults, children, stay?.childrenCountAsGuests) > max) {
    return 'above-max-guests'
  }
  return null
}

/** The price of a stay, or why it cannot be quoted. Pure; see the note at the top. */
export function quoteStay({
  nights,
  adults,
  children = 0,
  stay,
  packageId,
}: StayRequest & { packageId?: string | null }): StayQuote {
  if (!wholeCount(nights) || !wholeCount(adults) || !wholeCount(children)) {
    return { ok: false, reason: 'invalid-input' }
  }
  const limit = stayLimitProblem({ nights, adults, children, stay })
  if (limit) return { ok: false, reason: limit }

  const guests = countedGuests(adults, children, stay?.childrenCountAsGuests)
  const included = stay?.includedGuests
  const extraGuests =
    finite(included) && included >= 1 ? Math.max(0, guests - Math.floor(included)) : 0

  const lines: StayQuoteLine[] = []
  // A per-person-per-night package already charges every guest (ruling).
  let chargesExtraGuests = true

  if (packageId !== undefined && packageId !== null && packageId !== '') {
    const chosen = (stay?.packages ?? []).find((row) => row && String(row.id) === packageId)
    if (!chosen) return { ok: false, reason: 'unknown-package' }
    if (chosen.active === false) return { ok: false, reason: 'inactive-package' }
    if (!finite(chosen.price)) return { ok: false, reason: 'no-price' }
    const unit: StayPackageUnit = (STAY_PACKAGE_UNITS as readonly string[]).includes(
      String(chosen.unit),
    )
      ? (chosen.unit as StayPackageUnit)
      : 'per-stay'
    const quantity = unit === 'per-night' ? nights : unit === 'per-stay' ? 1 : guests * nights
    if (unit === 'per-person-per-night') chargesExtraGuests = false
    lines.push({
      kind: 'package',
      packageId,
      unit,
      unitPrice: chosen.price,
      quantity,
      amount: roundMoney(chosen.price * quantity),
    })
  } else {
    const price = stay?.nightlyPrice
    if (!finite(price)) return { ok: false, reason: 'no-price' }
    lines.push({
      kind: 'nightly',
      unitPrice: price,
      quantity: nights,
      amount: roundMoney(price * nights),
    })
  }

  const fee = stay?.extraGuestFee
  if (chargesExtraGuests && extraGuests > 0 && finite(fee) && fee > 0) {
    const quantity = extraGuests * nights
    lines.push({
      kind: 'extra-guests',
      unitPrice: fee,
      quantity,
      amount: roundMoney(fee * quantity),
    })
  }

  const total = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0))
  return { ok: true, total, currency: 'USD', nights, guests, extraGuests, lines }
}

/**
 * Whether the owner has said anything in the stay group. Values equal to the
 * defaults Payload fills in on every listing (fee 0, children counted, one
 * night minimum, no packages) say nothing, so a restaurant carrying them is
 * not refused for a group it never touched.
 */
export function stayHasContent(stay: StayConfig | null | undefined): boolean {
  if (!stay || typeof stay !== 'object') return false
  return (
    stay.nightlyPrice != null ||
    stay.includedGuests != null ||
    stay.maxGuests != null ||
    (stay.extraGuestFee != null && stay.extraGuestFee !== 0) ||
    (stay.minNights != null && stay.minNights !== 1) ||
    stay.childrenCountAsGuests === false ||
    (Array.isArray(stay.packages) && stay.packages.length > 0)
  )
}

/** Whether any feature is ticked. Unticked and unset say nothing. */
export function featuresHaveContent(features: StayFeatures | null | undefined): boolean {
  if (!features || typeof features !== 'object') return false
  return STAY_FEATURES.some((name) => features[name] === true)
}

const ONLY_GUEST_HOUSES = 'Stay prices and packages are only for guest houses (Getaways).'

/**
 * Why this stay group cannot be saved, or null. Getaways only; the guest
 * numbers must agree with each other; at most ten packages. Per-field rules
 * (numbers, decimals) are the fields' own validators.
 */
export function stayProblem(input: {
  subcategories?: readonly (string | null | undefined)[] | null
  stay?: StayConfig | null
}): string | null {
  const stay = input.stay
  if (!stayHasContent(stay)) return null
  if (!isWholePropertyStay(input.subcategories)) return ONLY_GUEST_HOUSES
  const included = stay?.includedGuests
  const max = stay?.maxGuests
  if (finite(included) && finite(max) && max < included) {
    return 'The maximum number of guests cannot be below the number the price includes.'
  }
  if (finite(stay?.extraGuestFee) && (stay?.extraGuestFee ?? 0) > 0 && !finite(included)) {
    return 'Set the number of included guests before setting an extra-guest fee.'
  }
  if ((stay?.packages ?? []).length > MAX_STAY_PACKAGES) {
    return `A guest house can have at most ${MAX_STAY_PACKAGES} packages.`
  }
  return null
}

/** Why these features cannot be saved, or null. Getaways only. */
export function featuresProblem(input: {
  subcategories?: readonly (string | null | undefined)[] | null
  features?: StayFeatures | null
}): string | null {
  if (!featuresHaveContent(input.features)) return null
  return isWholePropertyStay(input.subcategories)
    ? null
    : 'These features are only for guest houses (Getaways).'
}
