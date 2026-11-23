import type { Payload } from 'payload'
import { APIError } from 'payload'

/**
 * The same booking sent twice (QA CORE-R11).
 *
 * A real booking form carries an attempt id (`requestId`) and a retry of it is
 * answered with the original booking (lib/booking-service bookingForAttempt).
 * A caller that sends none - the public API, a script, a second tab - has no
 * such id, so two identical requests at the same moment used to make two
 * bookings. This is the guard that does not depend on one: inside the save,
 * under the listing's booking lock, an identical request by the same customer
 * made moments ago is the same booking.
 */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000

/** Thrown by the booking guard; the booking service turns it into a replay. */
export class DuplicateBookingError extends APIError {
  duplicateOf: string | number
  constructor(duplicateOf: string | number) {
    super('You have just made this exact booking.', 409)
    this.name = 'DuplicateBookingError'
    this.duplicateOf = duplicateOf
  }
}

/** The booking an error says this request duplicates, if it says so. */
export function duplicateOf(error: unknown): string | number | null {
  const id = (error as { duplicateOf?: unknown } | null)?.duplicateOf
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

const time = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null
  const ms = new Date(value as string).getTime()
  return Number.isNaN(ms) ? null : ms
}

const rawId = (value: unknown): unknown => (value as { id?: unknown } | null)?.id ?? value
const idOf = (value: unknown): string => String(rawId(value))

/** Room lines as a comparable string: room type, count and option, in any order. */
const linesKey = (lines: unknown): string =>
  (Array.isArray(lines) ? lines : [])
    .map((line: { roomType?: unknown; count?: unknown; optionId?: unknown }) =>
      [idOf(line?.roomType), Number(line?.count ?? 0), line?.optionId ?? ''].join(':'),
    )
    .sort()
    .join('|')

/**
 * Whether a stored booking is the one this write describes: same listing,
 * dates and party size, and the same area, rooms and quoted total whenever the
 * write names them. A write that names no area is judged on the rest: the
 * stored one may carry the area the guard chose for it.
 */
export function isTwin(data: Record<string, unknown>, doc: Record<string, unknown>): boolean {
  if (idOf(doc.business) !== idOf(data.business)) return false
  if (time(doc.start) !== time(data.start) || time(doc.end) !== time(data.end)) return false
  if (Number(doc.partySize) !== Number(data.partySize)) return false
  if (Number(doc.children ?? 0) !== Number(data.children ?? 0)) return false
  if (data.area && (doc.area ?? null) !== data.area) return false
  if (Array.isArray(data.rooms) && data.rooms.length > 0) {
    if (linesKey(data.rooms) !== linesKey(doc.rooms)) return false
  }
  const total = (data.price as { total?: unknown } | undefined)?.total
  const stored = (doc.price as { total?: unknown } | undefined)?.total
  if (typeof total === 'number' && typeof stored === 'number' && total !== stored) return false
  return true
}

/** A pending or confirmed booking by this customer that `data` repeats, made lately. */
export async function findRecentTwin(
  payload: Payload,
  data: Record<string, unknown>,
  now: Date = new Date(),
): Promise<{ id: string | number } | null> {
  if (data.customer === undefined || data.customer === null || data.business === undefined) {
    return null
  }
  const found = await payload.find({
    collection: 'bookings',
    depth: 0,
    limit: 20,
    pagination: false,
    overrideAccess: true,
    where: {
      and: [
        { customer: { equals: rawId(data.customer) as number } },
        { business: { equals: rawId(data.business) as number } },
        { status: { in: ['pending', 'confirmed'] } },
        { start: { equals: new Date(data.start as string).toISOString() } },
        { end: { equals: new Date(data.end as string).toISOString() } },
        {
          createdAt: { greater_than: new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString() },
        },
      ],
    },
  })
  const twin = (found.docs as unknown as Record<string, unknown>[]).find((doc) => isTwin(data, doc))
  return twin ? { id: twin.id as string | number } : null
}
