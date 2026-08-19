import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, selfOrStaff } from '../access/index'

/**
 * The public. People who book things.
 *
 * Separate from both other account types. A customer must never be able to
 * authenticate against the collection that reaches the admin panel, and keeping
 * them apart makes that a property of the schema rather than of a check.
 *
 * # Sign-up is public, but not through this collection
 *
 * `create` stays staff-only even though anybody may open an account. Payload
 * mounts a create endpoint at `/api/customers` for every collection, and that
 * one accepts whatever the caller sends with no throttle in front of it -
 * Payload 3 has no global rate limit to lean on. An open endpoint there is a
 * spam faucet.
 *
 * Public sign-up goes through `/account/signup` instead: rate-limited, and able
 * to handle the case this collection cannot, which is an address that already
 * has a record because the person once booked as a guest. Same shape as
 * bookings - one door, with the checks behind it.
 *
 * Staff keep `create` because entering a customer by hand is occasionally the
 * right thing during support, and reading is staff-wide so the admin can see
 * who has an account.
 */
export const Customers: CollectionConfig = {
  slug: 'customers',

  auth: {
    tokenExpiration: 60 * 60 * 24 * 7,
    maxLoginAttempts: 10,
    lockTime: 10 * 60 * 1000,

    /**
     * An account does nothing until the address is proven.
     *
     * Sign-up is public, so without this anyone could open an account under
     * somebody else's address - and a guest booking already creates a customer
     * record from whatever email was typed into a form. Verification is what
     * separates "a row exists with your address on it" from "somebody controls
     * that address".
     *
     * It makes deliverability load-bearing: a verification mail in a junk folder
     * is a sign-up that silently fails. Worth knowing while the domain's sending
     * reputation is still new.
     */
    verify: true,
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
