import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff } from '../access/index'

/**
 * What broke, and how often.
 *
 * One row per distinct bug rather than per occurrence - see lib/report for the
 * fingerprinting. That is what makes this viable as a table somebody reads: a
 * crash loop shows up as one row with a large count and a recent `lastSeen`,
 * not as ten thousand rows burying everything else.
 *
 * It also means the table is bounded by how many separate things are broken,
 * which stays small even when traffic does not, so there is no retention job to
 * forget to write.
 *
 * # Why here rather than a monitoring service
 *
 * Sentry is better at this and is what this becomes at volume. It also needs an
 * account, a DSN, a decision about sending customer-adjacent data to a third
 * party, and a browser bundle. This needs none of those, appears in the admin
 * panel staff already have open, and costs nothing - and because everything goes
 * through `reportError`, swapping it out later is one file.
 *
 * # The limitation worth stating
 *
 * If the database is what is broken, nothing lands here. `reportError` always
 * writes to the console as well, and Netlify captures that, so the failure mode
 * is "you have to go and look at the platform logs" rather than silence. It is
 * the one class of outage this cannot report on, and it is not a small one.
 */
export const ErrorEvents: CollectionConfig = {
  slug: 'error-events',

  admin: {
    useAsTitle: 'message',
    defaultColumns: ['message', 'source', 'count', 'lastSeen', 'resolved'],
    group: 'Analytics',
    description: 'Written by the server when something fails. Read-only.',
    // Newest problem first, which is the order somebody triaging wants.
    listSearchableFields: ['message', 'source', 'path'],
  },

  access: {
    read: isStaff,
    /**
     * No route creates one of these. `reportError` writes through the local API
     * with `overrideAccess`, which is the same arrangement as scan events - and
     * matters more here, because an open create endpoint on a table nobody
     * watches closely is a quiet way to fill a database.
     */
    create: () => false,
    // Staff may mark one resolved; the guard below limits it to that field.
    update: isStaff,
    delete: isAdmin,
  },

  fields: [
    {
      name: 'fingerprint',
      type: 'text',
      required: true,
      index: true,
      unique: true,
      admin: {
        readOnly: true,
        description: 'Identity of the bug. Occurrences with the same one are counted together.',
      },
    },

    { name: 'message', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'name', type: 'text', admin: { readOnly: true } },

    {
      name: 'source',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description: 'What was happening: booking.confirmation-email, auth.reset, request.',
      },
    },

    { name: 'path', type: 'text', admin: { readOnly: true } },

    {
      name: 'level',
      type: 'select',
      defaultValue: 'error',
      options: [
        { label: 'Error', value: 'error' },
        { label: 'Warning', value: 'warning' },
      ],
      index: true,
      admin: { readOnly: true },
    },

    {
      name: 'count',
      type: 'number',
      defaultValue: 1,
      index: true,
      admin: { readOnly: true, description: 'How many times this has happened.' },
    },

    { name: 'firstSeen', type: 'date', index: true, admin: { readOnly: true } },
    { name: 'lastSeen', type: 'date', index: true, admin: { readOnly: true } },

    {
      name: 'stack',
      type: 'textarea',
      admin: { readOnly: true, description: 'Truncated, and scrubbed of secrets and addresses.' },
    },

    {
      name: 'extra',
      type: 'textarea',
      admin: { readOnly: true, description: 'Context the caller attached, scrubbed the same way.' },
    },

    {
      name: 'resolved',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        description:
          'Tick when it is fixed. A later occurrence unticks it automatically, so a bug that comes back does not stay hidden.',
      },
    },
  ],
}
