import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, isStaffFieldLevel, selfOrStaff } from '../access/index'
import { partnerResetEmail } from '../lib/auth-email'
import { inviteBusinessUser } from '../hooks/inviteBusinessUser'
import { SESSION_COOKIES } from '../lib/auth-cookies'

/**
 * Owners and managers of listings we have onboarded.
 *
 * They exist to manage bookings for their own businesses, and nothing else.
 * How a listing appears - its photographs, its description, whether it is
 * verified - stays with the team. That is not a limitation to work around
 * later; it is the product. "Every listing is visited before it appears" is on
 * the home page, and it stops being true the day owners can edit their own
 * entries.
 *
 * Separate from `users` rather than another role on it, because `users` is the
 * collection bound to `admin.user`. Anything in that collection can reach the
 * admin panel; nothing here can, by construction rather than by a check
 * somebody has to remember to write.
 *
 * Accounts are created by staff during onboarding. There is deliberately no
 * public sign-up: a partner registering themselves would mean solving "prove
 * you own this restaurant", which is the verification problem large directories
 * still lose to. We visit every listing anyway, so the account is made by the
 * person standing in the building.
 */
export const BusinessUsers: CollectionConfig = {
  slug: 'business-users',

  auth: {
    // Secure in production, Lax always. See lib/auth-cookies.
    cookies: SESSION_COOKIES,
    // Shorter than staff's eight hours. These sessions live on personal phones
    // in a business, not on a laptop the team controls.
    tokenExpiration: 60 * 60 * 4,
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,

    /**
     * Ours, because Payload's default sends partners to
     * `/admin/reset-password` - the staff panel, which is the one screen in the
     * product they cannot open.
     *
     * The same bug the Customers collection had, missed here when that one was
     * fixed. It mattered more here: this email is not only recovery, it is how
     * an owner gets in for the first time, so a broken link meant an account
     * nobody could ever use.
     */
    forgotPassword: {
      generateEmailSubject: () => partnerResetEmail('').subject,
      generateEmailHTML: (args) => {
        if (!args?.token) throw new Error('No reset token to put in the partner email')
        return partnerResetEmail(args.token).html
      },
    },
  },

  hooks: {
    /**
     * A new partner is sent a link to choose their own password.
     *
     * Without this, onboarding meant a staff member typing a password into the
     * admin and passing it to the owner by hand - so the team knew every
     * partner's credentials and they lived in a chat log. See
     * inviteBusinessUser.
     */
    afterChange: [inviteBusinessUser],
  },

  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'businesses'],
    group: 'Accounts',
  },

  access: {
    read: selfOrStaff,
    // Staff-created only. See the note above about verification.
    create: isStaff,
    update: selfOrStaff,
    delete: isAdmin,
  },

  fields: [
    { name: 'name', type: 'text', required: true },

    {
      name: 'businesses',
      type: 'relationship',
      relationTo: 'businesses',
      hasMany: true,
      required: true,
      index: true,

      /**
       * The most security-sensitive field in this file.
       *
       * Every ownership decision reads this list, so anyone who can write it can
       * grant themselves any listing on the site - including its bookings, and
       * later its takings. `selfOrStaff` above lets an owner update their own
       * record so they can change their name or password; without this, that
       * same endpoint would let them append a business they have never heard of.
       *
       * Staff-only on both create and update, and there is no owner-facing UI
       * that submits it.
       */
      access: { create: isStaffFieldLevel, update: isStaffFieldLevel },

      admin: {
        description:
          'Which listings this account manages. A group may hold several. Only staff can change this.',
      },
    },

    { name: 'phone', type: 'text' },
  ],
}
