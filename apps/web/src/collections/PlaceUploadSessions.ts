import type { CollectionConfig } from 'payload'

/**
 * The phone upload session of the Magazine Places form: a business owner scans
 * a QR code and sends the logo and the main photo from their phone.
 *
 * The token is the secret in the QR link. Only its SHA-256 hash is stored, so a
 * database read never yields a usable link.
 *
 * Closed to everyone, staff included, like rate-limits: the services in lib
 * read and write it with `overrideAccess` (the Local API), and there is no
 * public or admin API for it. Hidden from the admin navigation.
 */
export const PlaceUploadSessions: CollectionConfig = {
  slug: 'place-upload-sessions',
  labels: { singular: 'Place Upload Session', plural: 'Place Upload Sessions' },
  admin: { hidden: true, useAsTitle: 'id' },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'tokenHash', type: 'text', required: true, unique: true, index: true },
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
    },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'logoReceived', type: 'checkbox', defaultValue: false },
    { name: 'heroReceived', type: 'checkbox', defaultValue: false },
    { name: 'closedAt', type: 'date' },
    // The media rows THIS session created (a JSON array of ids), so abandon
    // deletes exactly those and never a library image staff attached.
    { name: 'mediaIds', type: 'json' },
  ],
}
