import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, isStaffFieldLevel, selfOrStaff } from '../access/index'
import { passwordResetEmail, verificationEmail } from '../lib/auth-email'
import { closeRatherThanDelete } from '../hooks/closeRatherThanDelete'

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
     *
     * The template is ours because Payload's default sends customers to
     * `/admin/customers/verify/<token>` - the staff panel, which they cannot use.
     * See lib/auth-email; without this override `verify: true` made sign-up
     * impossible to finish rather than merely inconvenient.
     */
    verify: {
      generateEmailSubject: () => verificationEmail('').subject,
      generateEmailHTML: ({ token }) => verificationEmail(token ?? '').html,
    },

    /**
     * Same problem, same fix. Payload's default points at the admin panel's
     * reset form, which is bound to the staff collection.
     *
     * This is not only for forgotten passwords: `/auth/signup` sends a reset
     * when the address already has a record, which is how somebody who once
     * booked as a guest claims the account holding their bookings. So this is
     * the more heavily travelled of the two.
     */
    forgotPassword: {
      generateEmailSubject: () => passwordResetEmail('').subject,
      // Args are optional in the type, unlike the verify hook's. A message with
      // no token in it would be worse than none, so an absent one throws rather
      // than mailing a link to nowhere.
      generateEmailHTML: (args) => {
        if (!args?.token) throw new Error('No reset token to put in the email')
        return passwordResetEmail(args.token).html
      },
    },
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

    /**
     * Admin only, and it does not do what the word says. See the beforeDelete
     * hook: a customer with bookings is closed rather than removed, because the
     * bookings are the venue's record too.
     *
     * Staff keep the capability because "please delete my account" from somebody
     * who has lost access to their email is a request only staff can answer, and
     * it is the one the law puts a clock on.
     */
    delete: isAdmin,
  },

  hooks: {
    beforeDelete: [closeRatherThanDelete],
  },

  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'phone', type: 'text' },

    /**
     * Set when the account is closed. See lib/account-deletion.
     *
     * A closed account is a tombstone rather than a deleted row, because
     * bookings point at it and a booking is the venue's record as much as the
     * customer's. Everything identifying has been overwritten by the time this
     * is set; the timestamp exists so staff looking at the row can tell a closed
     * account from a corrupted one.
     */
    {
      name: 'deletedAt',
      type: 'date',
      index: true,
      access: { create: isStaffFieldLevel, update: isStaffFieldLevel },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Set when the customer closed their account. Nothing personal remains.',
      },
    },
  ],
}
