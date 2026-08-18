import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, selfOrStaff } from '../access/index'

/**
 * The public. People who book things.
 *
 * Separate from both other account types. A customer must never be able to
 * authenticate against the collection that reaches the admin panel, and keeping
 * them apart makes that a property of the schema rather than of a check.
 *
 * # Why `create` is staff-only right now
 *
 * Public sign-up is the point of this collection, and it is still closed. Three
 * things have to exist first, and none of them is this file:
 *
 *  1. A transactional email provider. Every build logs "No email adapter
 *     provided". Without one there is no address verification and no password
 *     reset, so an account is unrecoverable the first time someone forgets a
 *     password.
 *  2. A rate limiter that survives more than one instance. The current one is
 *     in-memory, so on serverless the real limit is the configured one times
 *     however many instances are warm - fine against a scraper, useless against
 *     someone opening accounts in bulk.
 *  3. CSRF configured for the live domain.
 *
 * Opening this endpoint before then does not produce sign-ups, it produces junk
 * rows and a mailbox nobody can reach. It is one line to change when those land,
 * and this comment is what makes that a decision rather than an oversight.
 */
export const Customers: CollectionConfig = {
  slug: 'customers',

  auth: {
    tokenExpiration: 60 * 60 * 24 * 7,
    maxLoginAttempts: 10,
    lockTime: 10 * 60 * 1000,
  },

  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'createdAt'],
    group: 'Accounts',
  },

  access: {
    /**
     * Self or staff, never "any logged-in user".
     *
     * `selfOrStaff` returns a query constraint rather than a boolean, so the
     * filter happens in the database. A customer listing `/api/customers` gets
     * their own row and no way to page past it - not a full list they were
     * merely not shown.
     */
    read: selfOrStaff,
    create: isStaff,
    update: selfOrStaff,
    delete: isAdmin,
  },

  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'phone', type: 'text' },
  ],
}
