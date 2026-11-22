import {
  APIError,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeValidateHook,
} from 'payload'
import { canHaveRoomTypes, OCCUPYING_STATUSES } from '@vardenia/core'
import { isStaffUser, ownedBusinessIds } from '../access/index'
import { ShapeProblem, checkAllowedBody, dataFields, mediaIdsIn } from '../lib/field-shape'
import { assertOwnMedia } from '../lib/partner-media'

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

/**
 * Who may write a room type, and for which hotel.
 *
 * The same shape as guardClosureWrite: `create` access is boolean and cannot
 * see the document, so the hotel is checked here on every write. The team
 * writes for anybody; a partner only for a listing attached to their account.
 * A room type never moves to another hotel, and only hotels have room types
 * (core canHaveRoomTypes): a restaurant keeps its single capacity, and a
 * guest house is booked as a whole property (Task 6).
 */
export const guardRoomTypeWrite: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
  originalDoc,
  collection,
}) => {
  if (!data) return data

  if (operation === 'update' && originalDoc && data.business !== undefined) {
    if (String(idOf(data.business)) !== String(idOf(originalDoc.business))) {
      throw new APIError('A room type cannot be moved to a different listing.', 400)
    }
  }

  const businessId = idOf(data.business ?? originalDoc?.business)
  if (businessId === null) throw new APIError('A room type has to name a listing.', 400)

  // No user is the server's own code (a script, a seed); access already stops
  // anonymous callers from the API.
  if (req.user && !isStaffUser(req.user)) {
    const owned = ownedBusinessIds(req.user).map(String)
    if (!owned.includes(String(businessId))) {
      throw new APIError('You can only manage room types for your own listings.', 403)
    }

    // Every key must be a field of the room type (a join, and anything the
    // collection does not have, is refused), and inside it every option row
    // key and every view, amenity and choice must be one on offer. Photos are
    // left to the media rule below, which accepts a populated photo. Task 5.
    const shaped: Record<string, unknown> = { ...data }
    delete shaped.photos
    // A join (openDates, the nights this room type is open) and a ui field
    // hold nothing: Payload stores no value for them and ignores one sent, and
    // it puts the key into the data of a room type itself. Refusing the key
    // made every partner save fail with "openDates cannot be changed" (Nov 22
    // QA, N3). It is dropped from the check, not trusted: nothing written to it
    // reaches the database, and the nights are still opened only through the
    // room-availability collection and its own access rules.
    const virtual = dataFields(collection.fields)
      .filter((field) => field.type === 'join' || field.type === 'ui')
      .map((field) => field.name)
    for (const name of virtual) delete shaped[name]
    const allowed = dataFields(collection.fields)
      .filter((field) => field.type !== 'join' && field.type !== 'ui')
      .map((field) => field.name)
    try {
      checkAllowedBody(shaped, collection.fields, allowed)
    } catch (error) {
      if (error instanceof ShapeProblem) throw new APIError(error.message, 400, null, true)
      throw error
    }

    // Photos: only the partner's own uploads, or what the room type already
    // shows (Task 3; the same rule as the listing, lib/partner-media).
    const partnerId = (req.user as { id?: string | number }).id
    const photos = mediaIdsIn(data, collection.fields)
    if (photos.length > 0 && partnerId !== undefined) {
      await assertOwnMedia({
        req,
        partnerId,
        ids: photos,
        alreadyOn: originalDoc ? mediaIdsIn(originalDoc, collection.fields) : [],
      })
    }
  }

  if (operation === 'create') {
    const business = await req.payload
      .findByID({
        collection: 'businesses',
        id: businessId,
        depth: 0,
        overrideAccess: true,
        select: { subcategories: true },
        req,
      })
      .catch(() => null)
    if (!business) throw new APIError('That listing does not exist.', 400)
    const kinds = (business as { subcategories?: string[] | null }).subcategories ?? []
    if (!canHaveRoomTypes(kinds)) {
      throw new APIError('Only hotels have room types.', 400)
    }
  }

  return data
}

/**
 * A room type with stays still to come is switched off, not deleted.
 *
 * Its booking lines would lose the type they count against, and the hotel
 * would lose the record of what the guest booked. Switching it off hides it
 * from guests and keeps every booking as it was.
 */
export const blockRoomTypeWithBookings: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const upcoming = await req.payload.count({
    collection: 'bookings',
    overrideAccess: true,
    req,
    where: {
      and: [
        { 'rooms.roomType': { equals: id } },
        { status: { in: [...OCCUPYING_STATUSES] } },
        { end: { greater_than: new Date().toISOString() } },
      ],
    },
  })
  if (upcoming.totalDocs > 0) {
    throw new APIError(
      `This room type has ${upcoming.totalDocs} upcoming booking(s). Switch it off instead of deleting it.`,
      400,
    )
  }
}
