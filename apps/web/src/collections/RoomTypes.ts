import type { Access, CollectionConfig, Where } from 'payload'
import {
  ROOM_TYPE_SUBCATEGORIES,
  roomAmenityOptions,
  roomViewOptions,
  validPrice,
} from '@vardenia/core'
import { fixedOnceCreated, isStaffUser, ownedBusinessIds } from '../access/index'
import { guardRoomTypeWrite, blockRoomTypeWithBookings } from '../hooks/guardRoomTypeWrite'
import { markMediaAttached } from '../hooks/markMediaAttached'
import {
  revalidateRoomTypeAfterChange,
  revalidateRoomTypeAfterDelete,
} from '../hooks/revalidateRoomTypes'

/**
 * A kind of room a hotel sells, and how many of it there are.
 *
 * Modelled on how Booking.com shows a hotel (checked 17 November 2026): rooms
 * are not listed one by one, identical rooms are one row. "Deluxe Twin, 30 m²,
 * sleeps 2, we have 2 left". So a room type carries its description, photos,
 * beds, size, views and amenities, and a number of rooms; a booking asks for
 * some rooms of one or more types for some nights, and the per-night count of
 * rooms already taken decides what is left (lib/room-availability, and the
 * database trigger in migration 20261117_room_types, which is the guarantee).
 *
 * # Options
 *
 * The same room can be sold with different conditions: breakfast or not, free
 * cancellation or non-refundable, pay at the hotel or in advance. Each is an
 * option of the room type, set by the partner, and all options of a type share
 * its rooms. A booking line names the option it was made with.
 *
 * # Who writes these
 *
 * The partner, from the partner area, for their own hotels; the team, for
 * anybody, from the admin. guardRoomTypeWrite checks the hotel on every write,
 * the same way guardClosureWrite does for closed dates.
 *
 * # Prices
 *
 * The partner enters a price per option, in USD per night. Prices became
 * public on 20 November 2026 (Task 5; they were staff and owner only before):
 * the field has no read rule, so the API returns it. What stays hidden is the
 * rooms of a hotel that is not published, or of a room type switched off, see
 * roomTypesRead. Core fromPrice gives the lowest price of a type's options.
 *
 * # Restaurants
 *
 * Untouched. Only hotels can have room types (core
 * canHaveRoomTypes), and a hotel with none books exactly as before, with the
 * listing's single capacity number.
 */

/**
 * The public sees active room types of published, not-trashed listings, and nothing else:
 * a hotel in draft or switched off must not leak its rooms or its prices.
 * Owners also see all of their own, and the team sees everything.
 */
export const roomTypesRead: Access = ({ req }) => {
  const { user } = req
  if (isStaffUser(user)) return true
  const owned = ownedBusinessIds(user)
  const publicRule: Where = {
    and: [
      { active: { equals: true } },
      { 'business._status': { equals: 'published' } },
      // A listing in the trash keeps its rows and its status (Payload sets deletedAt).
      { 'business.deletedAt': { exists: false } },
    ],
  }
  if (owned.length === 0) return publicRule
  return { or: [publicRule, { business: { in: owned } }] }
}

const roomTypesWrite: Access = ({ req }) => {
  const { user } = req
  if (!user) return false
  if (isStaffUser(user)) return true
  const owned = ownedBusinessIds(user)
  return owned.length > 0 ? { business: { in: owned } } : false
}

/** Creating is boolean; guardRoomTypeWrite checks which hotel. */
const roomTypesCreate: Access = ({ req }) =>
  isStaffUser(req.user) || ownedBusinessIds(req.user).length > 0

export const RoomTypes: CollectionConfig = {
  slug: 'room-types',
  labels: { singular: 'Room type', plural: 'Room types' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'business', 'rooms', 'sleepsAdults', 'active'],
    group: 'Directory',
    description:
      'The rooms a hotel sells. Identical rooms are one room type with a number of rooms. Partners manage their own from the partner area.',
  },
  access: {
    read: roomTypesRead,
    create: roomTypesCreate,
    update: roomTypesWrite,
    delete: roomTypesWrite,
  },
  hooks: {
    beforeValidate: [guardRoomTypeWrite],
    beforeDelete: [blockRoomTypeWithBookings],
    // A partner's photo becomes public once a room type shows it.
    afterChange: [markMediaAttached, revalidateRoomTypeAfterChange],
    afterDelete: [revalidateRoomTypeAfterDelete],
  },
  /**
   * The hotel page asks for one hotel's active room types, and the directory
   * asks for every active type of the hotels on a page: both lead with the
   * business. See the indexes the user asked for on 17 November 2026.
   */
  indexes: [{ fields: ['business', 'active'] }],
  fields: [
    {
      name: 'business',
      label: 'Listing',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
      access: { update: fixedOnceCreated },
      // Only hotels sell rooms (core ROOM_TYPE_SUBCATEGORIES); a getaway is
      // booked as a whole property since Task 6.
      filterOptions: { subcategories: { in: [...ROOM_TYPE_SUBCATEGORIES] } },
    },
    { name: 'name', type: 'text', required: true, localized: true, maxLength: 120 },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'room',
      options: [
        { label: 'Room', value: 'room' },
        { label: 'Suite', value: 'suite' },
      ],
      admin: { description: 'Guests can filter a hotel by rooms or suites.' },
    },
    { name: 'description', type: 'textarea', localized: true, maxLength: 2000 },
    {
      name: 'photos',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      maxRows: 12,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'rooms',
          label: 'Number of rooms',
          type: 'number',
          required: true,
          min: 0,
          max: 1000,
          defaultValue: 1,
          admin: {
            description:
              'How many identical rooms of this type in all. Guests can only book the nights opened in Room dates (closed until opened).',
          },
        },
        {
          name: 'sleepsAdults',
          label: 'Sleeps (adults)',
          type: 'number',
          required: true,
          min: 1,
          max: 20,
          defaultValue: 2,
        },
        {
          name: 'sleepsChildren',
          label: 'Plus children',
          type: 'number',
          min: 0,
          max: 20,
          defaultValue: 0,
        },
        { name: 'sizeM2', label: 'Size (m²)', type: 'number', min: 1, max: 2000 },
      ],
    },
    {
      name: 'beds',
      type: 'text',
      localized: true,
      maxLength: 160,
      admin: { description: 'For example "1 large double bed" or "2 single beds".' },
    },
    {
      name: 'views',
      type: 'select',
      hasMany: true,
      index: true,
      options: roomViewOptions,
    },
    {
      name: 'amenities',
      type: 'select',
      hasMany: true,
      index: true,
      options: roomAmenityOptions,
    },
    {
      /**
       * The ways this room is sold. All share the room type's rooms.
       *
       * Row ids are stable (Payload keeps them while the row is sent back with
       * its id), and a booking line stores the id of the option it was made
       * with, plus a copy of its wording for the email and the reservation book.
       */
      name: 'options',
      type: 'array',
      minRows: 1,
      maxRows: 6,
      labels: { singular: 'Option', plural: 'Options' },
      admin: {
        description:
          'How this room is sold: with or without breakfast, free cancellation or not, pay at the property or in advance. At least one.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'breakfast', label: 'Breakfast included', type: 'checkbox', index: true },
            {
              name: 'cancellation',
              type: 'select',
              required: true,
              defaultValue: 'free',
              index: true,
              options: [
                { label: 'Free cancellation', value: 'free' },
                { label: 'Non-refundable', value: 'non-refundable' },
              ],
            },
            {
              name: 'freeCancellationDays',
              label: 'Free until (days before check-in)',
              type: 'number',
              min: 0,
              max: 60,
              defaultValue: 1,
              admin: {
                condition: (_, sibling) => sibling?.cancellation === 'free',
                description: '0 means until the day of arrival.',
              },
            },
            {
              name: 'payment',
              type: 'select',
              required: true,
              defaultValue: 'at-property',
              options: [
                { label: 'Pay at the property', value: 'at-property' },
                { label: 'Pay in advance', value: 'in-advance' },
              ],
            },
            {
              name: 'price',
              label: 'Price per night (USD)',
              type: 'number',
              min: 0,
              // Public (Task 5): no read rule. Zero is allowed; at most two decimals.
              validate: (value: unknown) => validPrice(value),
              admin: { description: 'USD, shown on the website. Optional; up to two decimals.' },
            },
          ],
        },
      ],
    },
    {
      // The nights this room type is open, listed here with Create new
      // (18 November 2026). Closed on every night not listed.
      name: 'openDates',
      label: 'Open dates',
      type: 'join',
      collection: 'room-availability',
      on: 'roomType',
      defaultSort: 'startsOn',
      admin: {
        description:
          'Guests can only book the nights opened here. 0 rooms closes nights inside an open period.',
        defaultColumns: ['startsOn', 'endsOn', 'rooms'],
        allowCreate: true,
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Off hides it from guests. Existing bookings are kept.',
      },
    },
    {
      name: 'order',
      label: 'Display order',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar', description: 'Lower first.' },
    },
  ],
}
