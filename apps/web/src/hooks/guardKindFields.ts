import { ValidationError, type CollectionBeforeValidateHook } from 'payload'
import {
  canHaveBrand,
  canHaveRoomTypes,
  canHaveSeatingAreas,
  seatingAreasProblem,
  featuresProblem,
  isWholePropertyStay,
  stayProblem,
  type StayConfig,
  type StayFeatures,
} from '@vardenia/core'

/**
 * Fields that belong to one kind of place, refused on every other kind
 * (Task 6, 20 November 2026).
 *
 *  - `stay` and `features`: guest houses (getaways) only (core stayProblem,
 *    featuresProblem).
 *  - `facilities`, `popularFacilities`, `propertyHighlights`: hotels only
 *    (core canHaveRoomTypes; Task 5's rule).
 *  - A listing is never both a hotel and a getaway (Task 6 review): room
 *    bookings and whole-property stays of one listing would not be counted
 *    against each other, so the same night could be sold twice. Checked on
 *    every save of such a listing, sent or stored, staff included.
 *  - `seatingAreas`: restaurants only, at most 8 rows, one row per area key,
 *    whole tables 1 or more (core seatingAreasProblem, Task 8). Judged on the
 *    areas after this save (an array is replaced whole, so the body's, else
 *    the stored ones). A listing that keeps areas cannot change into a kind
 *    that has none: the areas are cleared first, which
 *    hooks/protectSeatingAreaBookings checks against upcoming bookings.
 *  - `brand`: restaurants only (core canHaveBrand, Task 9). Judged on the
 *    merged data when the body sets a brand that differs from the stored one,
 *    or changes the kinds of place of a listing that keeps a brand.
 *
 * Why a collection hook and not only the fields' own validators: the admin
 * hides the Rooms and Stay tabs on the other kinds (`admin.condition`), and
 * Payload skips the validation of every field under a hidden tab. So a
 * restaurant's PATCH carrying `stay` or `facilities` passed straight through
 * the field validators. A collection hook is not skipped, for staff, partners
 * or the local API alike.
 *
 * Judged on the kinds of place after this save (the body's subcategories, or
 * the stored ones on a PATCH), and only for a field the body sends with
 * content that differs from what is stored: the admin form sends hidden
 * fields back unchanged, and a listing whose kind changed is not stuck behind
 * a value nobody can see. Values equal to Payload's defaults are not content.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A stable form for comparing a sent value with the stored one. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== null && value[key] !== undefined)
        .map((key) => [key, canonical(value[key])]),
    )
  }
  return value ?? null
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

/** A relationship's id, whether sent as an id or a populated document. */
const idOf = (value: unknown): string | null => {
  if (typeof value === 'number' || typeof value === 'string')
    return value === '' ? null : String(value)
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null
}

const HOTEL_FIELDS = ['facilities', 'popularFacilities', 'propertyHighlights'] as const

export const guardKindFields: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data) return data
  const stored = (originalDoc ?? {}) as Record<string, unknown>
  const subcategories = (
    Array.isArray(data.subcategories) ? data.subcategories : (stored.subcategories ?? [])
  ) as string[]

  const sends = (name: string) =>
    Object.prototype.hasOwnProperty.call(data, name) && !same(data[name], stored[name])

  const errors: { path: string; message: string }[] = []

  if (isWholePropertyStay(subcategories) && subcategories.includes('hotels')) {
    errors.push({
      path: 'subcategories',
      message:
        'A listing cannot be both a hotel and a guest house (Getaways). Choose one: a hotel sells rooms, a guest house is booked whole.',
    })
  }

  if (sends('stay')) {
    // A PATCH may send part of the group; Payload keeps the rest as stored.
    const stay = {
      ...(isRecord(stored.stay) ? stored.stay : {}),
      ...(isRecord(data.stay) ? data.stay : {}),
    } as StayConfig
    const problem = stayProblem({ subcategories, stay })
    if (problem) errors.push({ path: 'stay', message: problem })
  }

  if (sends('features')) {
    const features = {
      ...(isRecord(stored.features) ? stored.features : {}),
      ...(isRecord(data.features) ? data.features : {}),
    } as StayFeatures
    const problem = featuresProblem({ subcategories, features })
    if (problem) errors.push({ path: 'features', message: problem })
  }

  const areasAfter = (
    Object.prototype.hasOwnProperty.call(data, 'seatingAreas')
      ? data.seatingAreas
      : stored.seatingAreas
  ) as unknown[] | null | undefined
  const subcategoriesChanged =
    Array.isArray(data.subcategories) && !same(data.subcategories, stored.subcategories ?? [])
  if (sends('seatingAreas') || (subcategoriesChanged && !canHaveSeatingAreas(subcategories))) {
    const problem = seatingAreasProblem({ subcategories, areas: areasAfter })
    if (problem) errors.push({ path: 'seatingAreas', message: problem })
  }

  const brandAfter = idOf(
    Object.prototype.hasOwnProperty.call(data, 'brand') ? data.brand : stored.brand,
  )
  const brandChanged =
    Object.prototype.hasOwnProperty.call(data, 'brand') && brandAfter !== idOf(stored.brand)
  if (
    brandAfter !== null &&
    (brandChanged || subcategoriesChanged) &&
    !canHaveBrand(subcategories)
  ) {
    errors.push({ path: 'brand', message: 'A brand is only for restaurants.' })
  }

  if (!canHaveRoomTypes(subcategories)) {
    for (const name of HOTEL_FIELDS) {
      const value = data[name]
      if (sends(name) && Array.isArray(value) && value.length > 0) {
        errors.push({ path: name, message: 'Facilities and highlights are only for hotels.' })
      }
    }
  }

  if (errors.length > 0) throw new ValidationError({ collection: 'businesses', errors })
  return data
}
