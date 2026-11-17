import type { Access, CollectionConfig } from 'payload'
import { fixedOnceCreated, isStaffUser, ownedBusinessIds } from '../access/index'
import { guardRoomAvailabilityWrite } from '../hooks/guardRoomAvailabilityWrite'
import {
  revalidateRoomTypeAfterChange,
  revalidateRoomTypeAfterDelete,
} from '../hooks/revalidateRoomTypes'

/**
 * The dates a room type is open, and how many of its rooms are sold on them
 * (17 November 2026).
 *
 * Like the "Rooms to sell" row of Booking.com's extranet calendar: a hotel
 * opens a room type for a range of nights with a number of rooms, and only
 * those nights can be booked. A room type is closed on every night no period
 * covers (decided 17 November 2026: closed until the hotel opens dates). A
 * period with 0 rooms closes those nights. When periods overlap, the one saved
 * last wins, so a hotel can open a season and then close a few nights inside it.
 *
 * Nights, not days: a period from the 13th to the 20th opens the nights of the
 * 13th to the 20th, so a guest can stay until the morning of the 21st.
 */

const own: Access = ({ req }) => {
  const { user } = req
  if (!user) return false
  if (isStaffUser(user)) return true
  const owned = ownedBusinessIds(user)
  return owned.length > 0 ? { business: { in: owned } } : false
}

const create: Access = ({ req }) => isStaffUser(req.user) || ownedBusinessIds(req.user).length > 0

export const RoomAvailability: CollectionConfig = {
  slug: 'room-availability',
  labels: { singular: 'Room dates', plural: 'Room dates' },
  admin: {
    useAsTitle: 'startsOn',
    defaultColumns: ['roomType', 'startsOn', 'endsOn', 'rooms'],
    group: 'Directory',
    description:
      'The nights each room type is open and how many rooms are sold. A room type is closed on nights no entry covers.',
  },
  access: { read: own, create, update: own, delete: own },
  hooks: {
    beforeValidate: [guardRoomAvailabilityWrite],
    afterChange: [revalidateRoomTypeAfterChange],
    afterDelete: [revalidateRoomTypeAfterDelete],
  },
  indexes: [{ fields: ['roomType', 'startsOn', 'endsOn'] }],
  fields: [
    {
      name: 'roomType',
      type: 'relationship',
      relationTo: 'room-types',
      required: true,
      index: true,
      access: { update: fixedOnceCreated },
    },
    {
      /** Copied from the room type by the guard, so access can filter on it. */
      name: 'business',
      label: 'Listing',
      type: 'relationship',
      relationTo: 'businesses',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'startsOn',
      label: 'First night',
      type: 'text',
      required: true,
      index: true,
      admin: { placeholder: 'YYYY-MM-DD' },
    },
    {
      name: 'endsOn',
      label: 'Last night',
      type: 'text',
      required: true,
      index: true,
      admin: {
        placeholder: 'YYYY-MM-DD',
        description: 'Inclusive. The guest leaves the next morning.',
      },
    },
    {
      name: 'rooms',
      label: 'Rooms to sell',
      type: 'number',
      required: true,
      min: 0,
      max: 1000,
      admin: { description: '0 closes these nights.' },
    },
  ],
}
