import { ValidationError, type CollectionBeforeValidateHook, type PayloadRequest } from 'payload'
import {
  OCCUPYING_STATUSES,
  SEATING_AREA_KEYS,
  canHaveSeatingAreas,
  seatingAreaShrinkProblem,
} from '@vardenia/core'
import { lockBookingSlots } from '../lib/booking-lock'

/**
 * A seating area is never removed or shrunk under upcoming bookings (Task 8,
 * 20 November 2026).
 *
 * When a save changes a listing's `seatingAreas` (or changes its kind so that
 * its areas no longer apply), the listing's upcoming occupying bookings that
 * hold an area are read, and the save is refused when an area they hold would
 * disappear, or have fewer tables than the most of them held at one time (core
 * seatingAreaShrinkProblem). Otherwise those guests would hold a table the
 * restaurant no longer lists, and the area's count would no longer match what
 * the database trigger enforces. Applies to staff and partners alike; past
 * bookings do not matter (the trigger only counts overlaps with new bookings).
 *
 * The listing's booking lock (lib/booking-lock, the capacity trigger's key) is
 * taken first, on this save's own transaction, so a booking cannot be inserted
 * into an area between this check and the commit that changes the area: the
 * insert's trigger waits for this save, then reads the areas it left.
 *
 * Only on update (a new listing has no bookings) and only when the areas
 * actually change, so an ordinary save takes no lock.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A row as the area is concerned: setting, smoking and tables. */
const areaShape = (rows: unknown): string =>
  JSON.stringify(
    (Array.isArray(rows) ? rows : []).map((row) =>
      isRecord(row) ? [row.setting ?? null, row.smoking === true, row.tables ?? null] : null,
    ),
  )

export const protectSeatingAreaBookings: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data || operation !== 'update' || !originalDoc) return data
  const stored = originalDoc as Record<string, unknown>
  const id = stored.id as string | number | undefined
  if (id === undefined || id === null) return data

  const kindsOf = (doc: Record<string, unknown>) =>
    (Array.isArray(doc.subcategories) ? doc.subcategories : []) as string[]
  const before = canHaveSeatingAreas(kindsOf(stored)) ? stored.seatingAreas : []
  const subcategories = Array.isArray(data.subcategories) ? data.subcategories : kindsOf(stored)
  const sent = Object.prototype.hasOwnProperty.call(data, 'seatingAreas')
  const after = canHaveSeatingAreas(subcategories)
    ? sent
      ? data.seatingAreas
      : stored.seatingAreas
    : []

  if (areaShape(before) === areaShape(after)) return data
  if (!Array.isArray(before) || before.length === 0) return data

  await lockBookingSlots(req as PayloadRequest, id)

  const found = await req.payload.find({
    collection: 'bookings',
    depth: 0,
    // Every upcoming booking of the listing: none may be cut off by a limit.
    pagination: false,
    overrideAccess: true,
    req,
    select: { area: true, start: true, end: true },
    where: {
      and: [
        { business: { equals: id } },
        { status: { in: [...OCCUPYING_STATUSES] } },
        { area: { in: [...SEATING_AREA_KEYS] } },
        { end: { greater_than: new Date().toISOString() } },
      ],
    },
  })

  const bookings = found.docs.flatMap((doc) => {
    const row = doc as { area?: string | null; start?: unknown; end?: unknown }
    const start = new Date(String(row.start))
    const end = new Date(String(row.end))
    return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
      ? []
      : [{ area: row.area ?? null, start, end }]
  })

  const problem = seatingAreaShrinkProblem({ before, after: after as unknown[], bookings })
  if (problem) {
    throw new ValidationError({
      collection: 'businesses',
      errors: [{ path: 'seatingAreas', message: problem }],
    })
  }
  return data
}
