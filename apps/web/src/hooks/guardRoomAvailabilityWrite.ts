import { APIError, type CollectionBeforeValidateHook } from 'payload'
import { isStaffUser, ownedBusinessIds } from '../access/index'
import { isCalendarDay } from '../lib/availability'

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

/**
 * Open dates for a room type: only for the partner's own hotels, real days in
 * order, and never more rooms than the room type has. The listing is copied
 * from the room type so the collection's access rules can filter on it.
 */
export const guardRoomAvailabilityWrite: CollectionBeforeValidateHook = async ({
  data,
  req,
  originalDoc,
}) => {
  if (!data) return data

  const roomTypeId = idOf(data.roomType ?? originalDoc?.roomType)
  if (roomTypeId === null) throw new APIError('Choose a room type.', 400)

  const roomType = await req.payload
    .findByID({
      collection: 'room-types',
      id: roomTypeId,
      depth: 0,
      overrideAccess: true,
      select: { business: true, rooms: true },
      req,
    })
    .catch(() => null)
  if (!roomType) throw new APIError('That room type does not exist.', 400)

  const businessId = idOf((roomType as { business?: unknown }).business)
  if (req.user && !isStaffUser(req.user)) {
    const owned = ownedBusinessIds(req.user).map(String)
    if (!owned.includes(String(businessId))) {
      throw new APIError('You can only open dates for your own rooms.', 403)
    }
  }
  data.business = businessId

  const startsOn = data.startsOn ?? originalDoc?.startsOn
  const endsOn = data.endsOn ?? originalDoc?.endsOn
  if (!isCalendarDay(startsOn) || !isCalendarDay(endsOn)) {
    throw new APIError('Dates must be real days, written as YYYY-MM-DD.', 400)
  }
  if (endsOn < startsOn) throw new APIError('The last night cannot be before the first.', 400)

  const rooms = Number(data.rooms ?? originalDoc?.rooms)
  const total = Number((roomType as { rooms?: unknown }).rooms ?? 0)
  if (!Number.isInteger(rooms) || rooms < 0) throw new APIError('Rooms must be 0 or more.', 400)
  if (rooms > total) {
    throw new APIError(`This room type has ${total} room(s). Open ${total} or fewer.`, 400)
  }

  return data
}
