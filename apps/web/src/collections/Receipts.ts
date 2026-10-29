import {
  APIError,
  type Access,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
} from 'payload'
import {
  CUSTOMER_COLLECTION,
  isAdmin,
  isStaff,
  isStaffFieldLevel,
  isStaffUser,
  fixedOnceCreated,
} from '../access/index'
import { unguessableFilename } from '../hooks/unguessableFilename'

/**
 * A photo (or PDF) of what a guest paid, attached to one booking.
 *
 * What the commission is taken of (core/booking-fees) is the amount spent, and
 * a receipt is the best evidence of it there is. This collection is only the
 * storage: the guest-facing upload, the account page and the billing rule that
 * reads it come after.
 *
 * # Private, unlike every other upload
 *
 * A receipt can carry the last digits of a card, a name and what somebody ate.
 * So it is stored in its own bucket that is not public (S3_RECEIPTS_BUCKET, see
 * payload.config.ts) and every file is served through Payload, which applies
 * `read` below first: the guest whose booking it is, and the team. Partners,
 * other guests and anonymous callers get nothing, the file included.
 *
 * # Who adds one
 *
 * Staff, from the admin, for now. The guest uploads through their own signed
 * link in the next step, which writes with access overridden, so `create` stays
 * staff-only here and the API offers no open door.
 */

/** Staff see every receipt; a guest only the ones on their own bookings. */
const ownOrStaff: Access = ({ req }) => {
  if (isStaffUser(req.user)) return true
  const user = req.user as { id?: number | string; collection?: string } | null
  if (user?.collection !== CUSTOMER_COLLECTION || user.id === undefined) return false
  return { customer: { equals: user.id } }
}

/**
 * No local disk in production.
 *
 * Without the private bucket, Payload would write the file to the server's own
 * disk, which on a serverless host disappears with the instance: the guest
 * would see "uploaded" and the team would find nothing. Refused instead, with a
 * message that says what is missing. Local development keeps the disk.
 */
export const requireReceiptStorage: CollectionBeforeOperationHook = ({ operation, args }) => {
  if (operation !== 'create') return args
  if (process.env.NODE_ENV === 'production' && !process.env.S3_RECEIPTS_BUCKET?.trim()) {
    throw new APIError('Receipt storage is not set up (S3_RECEIPTS_BUCKET).', 503)
  }
  return args
}

/**
 * The receipt belongs to whoever the booking belongs to.
 *
 * Copied from the booking, never taken from the request, so the read rule above
 * cannot be pointed at somebody else's account by naming them.
 */
export const copyBookingCustomer: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
  if (operation !== 'create') return data
  const bookingId =
    typeof data.booking === 'object' && data.booking !== null
      ? (data.booking as { id?: unknown }).id
      : data.booking
  if (typeof bookingId !== 'number' && typeof bookingId !== 'string') {
    throw new APIError('A receipt needs the booking it belongs to.', 400)
  }
  const booking = (await req.payload
    .findByID({ collection: 'bookings', id: bookingId, depth: 0, overrideAccess: true, req })
    .catch(() => null)) as { customer?: unknown } | null
  if (!booking) throw new APIError('That booking does not exist.', 400)
  const customer =
    typeof booking.customer === 'object' && booking.customer !== null
      ? (booking.customer as { id?: unknown }).id
      : booking.customer
  data.customer = customer ?? null
  return data
}

export const RECEIPT_CURRENCIES = ['USD', 'LBP'] as const

export const Receipts: CollectionConfig = {
  slug: 'receipts',
  labels: { singular: 'Receipt', plural: 'Receipts' },
  admin: {
    group: 'Bookings',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'booking', 'amount', 'currency', 'createdAt'],
    description:
      'What guests paid, as photographed. Private: only the guest and the team can open one.',
  },
  access: {
    read: ownOrStaff,
    create: isStaff,
    update: isStaff,
    delete: isAdmin,
  },
  hooks: {
    beforeOperation: [requireReceiptStorage, unguessableFilename],
    beforeChange: [copyBookingCustomer],
  },
  upload: {
    // Outside `public/`, so on a machine with no bucket the files are still
    // only reachable through Payload's access check, never as a static file.
    staticDir: 'private/receipts',
    // Photos and PDFs. No SVG (it can carry script) and no HEIC: browsers
    // hand an iPhone photo over as JPEG when it is picked for upload.
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },
  fields: [
    {
      name: 'booking',
      type: 'relationship',
      relationTo: 'bookings',
      required: true,
      index: true,
      access: { update: fixedOnceCreated },
    },
    {
      // Set from the booking (copyBookingCustomer), and what `read` filters on.
      name: 'customer',
      type: 'relationship',
      relationTo: 'customers',
      index: true,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, description: 'The guest the booking belongs to.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'amount',
          label: 'Total on the receipt',
          type: 'number',
          min: 0,
          admin: { width: '50%', step: 0.01 },
        },
        {
          name: 'currency',
          type: 'select',
          defaultValue: 'USD',
          options: RECEIPT_CURRENCIES.map((value) => ({ label: value, value })),
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'note',
      type: 'textarea',
      access: { read: isStaffFieldLevel },
      admin: { description: 'For the team. Never shown to the guest.' },
    },
  ],
}
