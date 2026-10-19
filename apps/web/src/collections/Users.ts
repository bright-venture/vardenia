import type { CollectionConfig } from 'payload'
import { STAFF_COLLECTION, isAdmin, isAdminFieldLevel, isStaff } from '../access/index'
import { SESSION_COOKIES } from '../lib/auth-cookies'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Team member', plural: 'Team' },
  auth: {
    // Secure in production, Lax always. See lib/auth-cookies.
    cookies: SESSION_COOKIES,
    tokenExpiration: 60 * 60 * 8,
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'roles'],
    group: 'People',
  },
  access: {
    read: isStaff,
    create: isAdmin,
    update: ({ req, id }) => {
      if (isAdmin({ req } as Parameters<typeof isAdmin>[0])) return true
      // Everyone else on the team may edit only their own profile. The
      // collection check is the point: a customer or a partner has an id too,
      // numbered separately from 1, and matching on id alone let customer #1
      // edit team member #1 - email and password included. See selfOrStaff.
      return req.user?.collection === STAFF_COLLECTION && req.user.id === id
    },
    delete: isAdmin,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      // Deliberately no default. Whoever creates an account must choose the role,
      // rather than inheriting whichever one happened to be listed first.
      // Only an admin can grant roles, so nobody can promote themselves via the API.
      access: { create: isAdminFieldLevel, update: isAdminFieldLevel },
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Staff', value: 'staff' },
      ],
      admin: {
        description:
          'Staff create and edit all content, make and edit QR codes, and run bookings and billing. Admin additionally manages the team, changes the sign-in of partner and customer accounts, sets tier, featured, verified and booking fees, deletes what cannot be undone, and switches printed QR codes off. Venue owners sign in with a partner account, not here.',
      },
    },
    { name: 'phone', type: 'text' },
  ],
}
