import {
  CONTACT_FIELDS,
  STAY_FEATURES,
  STAY_PACKAGE_UNITS,
  canHaveBrand,
  canHaveRoomTypes,
  canHaveSeatingAreas,
  isWholePropertyStay,
  type StayPackageUnit,
} from '@vardenia/core'
import { DEFAULT_LOCALE } from '@vardenia/i18n'
import {
  PAYMENT_METHODS,
  descriptionParagraphs,
  type ListingDraft,
  type ListingKinds,
} from './partner-listing-edit'

/**
 * A stored listing as the partner "Listing details" form's starting values
 * (Task 12a, 21 November 2026). Pure; lib/partner-listing-details reads the
 * documents. Server side only (it imports the core package entry).
 */

export interface EditableListing {
  id: number
  name: string
  kinds: ListingKinds
  /** A restaurant: may add branches (core canHaveBrand). */
  restaurant: boolean
  /** False when the description has formatting a plain textarea would lose. */
  descriptionEditable: boolean
  /**
   * The name to send with every change made off the default language: this
   * language's name, else the default one, else any (lib/partner-listing-edit
   * PatchOptions). Empty when no name is known.
   */
  requiredName: string
  initial: ListingDraft
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const num = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : ''

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    : []

/**
 * A localized value read with locale 'all' (`{ en: ..., ar: ... }`): the
 * default language's, else the first other language's that is not blank.
 */
export function anyLanguage(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) return ''
  const byLocale = value as Record<string, unknown>
  const first = str(byLocale[DEFAULT_LOCALE]).trim()
  if (first) return str(byLocale[DEFAULT_LOCALE])
  for (const other of Object.values(byLocale)) if (str(other).trim()) return str(other)
  return ''
}

/**
 * One stored listing as the form's starting values.
 *
 * `all` is the same listing read with locale 'all' (name and stay only).
 * Required localized values - the name, each package's name - must exist in
 * the language a save is made in, or Payload refuses the save on a field the
 * partner never touched. So a blank package name is filled from the default
 * language, else from any language that has one (scenario: a package added
 * from the Arabic page, then the English page), which is what guests already
 * see through fallback; and `requiredName` is worked out the same way. Only
 * required values: package descriptions stay blank.
 */
export function toEditable(
  doc: Record<string, unknown>,
  all?: Record<string, unknown> | null,
): EditableListing {
  const subcategories = list(doc.subcategories)
  const kinds: ListingKinds = {
    hotel: canHaveRoomTypes(subcategories),
    getaway: isWholePropertyStay(subcategories),
    seating: canHaveSeatingAreas(subcategories),
  }
  const paragraphs = descriptionParagraphs(doc.description)
  const contact = (doc.contact ?? {}) as Record<string, unknown>
  const stay = (doc.stay ?? {}) as Record<string, unknown>
  const features = (doc.features ?? {}) as Record<string, unknown>
  const fallbackLabels = new Map(
    rows(((all?.stay ?? {}) as Record<string, unknown>).packages).map((row) => [
      String(row.id ?? ''),
      anyLanguage(row.label),
    ]),
  )
  const payments = (doc.payments ?? {}) as Record<string, unknown>

  return {
    id: Number(doc.id),
    name: str(doc.name),
    kinds,
    restaurant: canHaveBrand(subcategories),
    descriptionEditable: paragraphs !== null,
    requiredName: str(doc.name).trim() ? str(doc.name) : anyLanguage(all?.name),
    initial: {
      tagline: str(doc.tagline),
      description: (paragraphs ?? []).join('\n'),
      contact: Object.fromEntries(
        CONTACT_FIELDS.map((field) => [field, str(contact[field])]),
      ) as ListingDraft['contact'],
      address: str(doc.address),
      mapUrl: str(doc.mapUrl),
      amenities: list(doc.amenities),
      payments: Object.fromEntries(
        PAYMENT_METHODS.map((method) => [method, payments[method] === true]),
      ) as ListingDraft['payments'],
      facilities: list(doc.facilities),
      popularFacilities: list(doc.popularFacilities),
      propertyHighlights: list(doc.propertyHighlights),
      stay: {
        nightlyPrice: num(stay.nightlyPrice),
        includedGuests: num(stay.includedGuests),
        maxGuests: num(stay.maxGuests),
        extraGuestFee: num(stay.extraGuestFee),
        childrenCountAsGuests: stay.childrenCountAsGuests !== false,
        minNights: num(stay.minNights),
        packages: rows(stay.packages).map((row, index) => ({
          key: `package-${String(row.id ?? index)}`,
          id: typeof row.id === 'string' && row.id ? row.id : null,
          label:
            str(row.label) ||
            (typeof row.id === 'string' && row.id ? (fallbackLabels.get(row.id) ?? '') : ''),
          description: str(row.description),
          price: num(row.price),
          unit: (STAY_PACKAGE_UNITS as readonly string[]).includes(str(row.unit))
            ? (row.unit as StayPackageUnit)
            : 'per-stay',
          active: row.active !== false,
        })),
      },
      features: Object.fromEntries(
        STAY_FEATURES.map((feature) => [feature, features[feature] === true]),
      ) as ListingDraft['features'],
      seatingAreas: rows(doc.seatingAreas).map((row, index) => ({
        key: `area-${String(row.id ?? index)}`,
        id: typeof row.id === 'string' && row.id ? row.id : null,
        setting: row.setting === 'outdoor' ? 'outdoor' : 'indoor',
        smoking: row.smoking === true,
        tables: num(row.tables),
        label: str(row.label),
      })),
    },
  }
}
