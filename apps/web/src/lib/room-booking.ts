import type { Payload, PayloadRequest } from 'payload'
import { OCCUPYING_STATUSES, type BookingStatus } from '@vardenia/core'
import type {
  ExistingRoomBooking,
  OpenPeriod,
  RoomLine,
  RoomOption,
  RoomTypeInventory,
} from './room-availability'
import { addDays, beirutDate } from './beirut'

/**
 * Reading a hotel's room types and room bookings from the database, for
 * lib/room-availability. Read with access overridden: a guest cannot read
 * bookings, and only verdicts and counts leave the callers.
 */

const idOf = (value: unknown): number | null => {
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  const n = Number(id)
  return Number.isFinite(n) ? n : null
}

export function toInventory(doc: Record<string, unknown>): RoomTypeInventory {
  const options = Array.isArray(doc.options) ? (doc.options as Record<string, unknown>[]) : []
  return {
    id: Number(doc.id),
    name: typeof doc.name === 'string' ? doc.name : null,
    rooms: Number(doc.rooms ?? 0),
    sleepsAdults: Number(doc.sleepsAdults ?? 2),
    sleepsChildren: Number(doc.sleepsChildren ?? 0),
    active: doc.active !== false,
    kind: doc.kind === 'suite' ? 'suite' : 'room',
    views: Array.isArray(doc.views) ? (doc.views as string[]) : [],
    options: options.map((option): RoomOption => ({
      id: String(option.id ?? ''),
      breakfast: option.breakfast === true,
      cancellation: option.cancellation === 'non-refundable' ? 'non-refundable' : 'free',
      freeCancellationDays:
        typeof option.freeCancellationDays === 'number' ? option.freeCancellationDays : null,
      payment: option.payment === 'in-advance' ? 'in-advance' : 'at-property',
      // Read at booking time for the price snapshot (Task 7); 0 is a price.
      price:
        typeof option.price === 'number' && Number.isFinite(option.price) ? option.price : null,
    })),
  }
}

/** Active room types of these hotels, by hotel. */
export async function roomTypesFor(
  payload: Payload,
  businessIds: readonly number[],
  { req, locale }: { req?: PayloadRequest; locale?: string } = {},
): Promise<Map<number, RoomTypeInventory[]>> {
  const out = new Map<number, RoomTypeInventory[]>()
  if (businessIds.length === 0) return out
  const result = await payload.find({
    collection: 'room-types',
    depth: 0,
    limit: 1000,
    pagination: false,
    overrideAccess: true,
    sort: 'order',
    ...(req ? { req } : {}),
    ...(locale ? { locale: locale as never } : {}),
    where: { and: [{ business: { in: [...businessIds] } }, { active: { equals: true } }] },
  })
  const periodsBy = await openPeriodsFor(
    payload,
    result.docs.map((doc) => Number(doc.id)),
    req,
  )
  for (const doc of result.docs) {
    const business = idOf((doc as { business?: unknown }).business)
    if (business === null) continue
    const list = out.get(business) ?? []
    list.push({
      ...toInventory(doc as unknown as Record<string, unknown>),
      periods: periodsBy.get(Number(doc.id)) ?? [],
    })
    out.set(business, list)
  }
  return out
}

/**
 * The nights each room type is open (Room dates), from a year back so a staff
 * move of a recent booking still sees its nights.
 */
export async function openPeriodsFor(
  payload: Payload,
  roomTypeIds: readonly number[],
  req?: PayloadRequest,
): Promise<Map<number, OpenPeriod[]>> {
  const out = new Map<number, OpenPeriod[]>()
  if (roomTypeIds.length === 0) return out
  const result = await payload.find({
    collection: 'room-availability',
    depth: 0,
    limit: 5000,
    pagination: false,
    overrideAccess: true,
    sort: 'id',
    ...(req ? { req } : {}),
    where: {
      and: [
        { roomType: { in: [...roomTypeIds] } },
        { endsOn: { greater_than_equal: addDays(beirutDate(), -366) } },
      ],
    },
  })
  for (const doc of result.docs) {
    const roomType = idOf((doc as { roomType?: unknown }).roomType)
    if (roomType === null) continue
    const list = out.get(roomType) ?? []
    list.push({
      id: Number(doc.id),
      startsOn: String((doc as { startsOn?: unknown }).startsOn ?? ''),
      endsOn: String((doc as { endsOn?: unknown }).endsOn ?? ''),
      rooms: Number((doc as { rooms?: unknown }).rooms ?? 0),
    })
    out.set(roomType, list)
  }
  return out
}

/** Occupying room bookings of these hotels overlapping the span, by hotel. */
export async function roomBookingsFor(
  payload: Payload,
  businessIds: readonly number[],
  start: Date,
  end: Date,
  req?: PayloadRequest,
): Promise<Map<number, ExistingRoomBooking[]>> {
  const out = new Map<number, ExistingRoomBooking[]>()
  if (businessIds.length === 0) return out
  const result = await payload.find({
    collection: 'bookings',
    depth: 0,
    limit: 5000,
    pagination: false,
    overrideAccess: true,
    ...(req ? { req } : {}),
    select: { business: true, start: true, end: true, status: true, rooms: true },
    where: {
      and: [
        { business: { in: [...businessIds] } },
        { roomCount: { greater_than: 0 } },
        { status: { in: [...OCCUPYING_STATUSES] } },
        { start: { less_than: end.toISOString() } },
        { end: { greater_than: start.toISOString() } },
      ],
    },
  })
  for (const doc of result.docs) {
    const business = idOf((doc as { business?: unknown }).business)
    const s = new Date(String((doc as { start?: unknown }).start))
    const e = new Date(String((doc as { end?: unknown }).end))
    if (business === null || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue
    const rows = ((doc as { rooms?: unknown }).rooms ?? []) as Record<string, unknown>[]
    const lines: RoomLine[] = rows.flatMap((row) => {
      const roomType = idOf(row.roomType)
      return roomType === null ? [] : [{ roomType, count: Number(row.count ?? 0) }]
    })
    const list = out.get(business) ?? []
    list.push({
      id: (doc as { id: number }).id,
      start: s,
      end: e,
      status: (doc as { status: BookingStatus }).status,
      lines,
    })
    out.set(business, list)
  }
  return out
}
