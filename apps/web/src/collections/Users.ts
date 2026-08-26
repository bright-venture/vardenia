import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminFieldLevel, isStaff } from '../access/index'
import { SESSION_COOKIES } from '../lib/auth-cookies'

export const Users: CollectionConfig = {
  slug: 'users',
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
    group: 'Administration',
  },
  access: {
    read: isStaff,
    create: isAdmin,
    update: ({ req, id }) => {
      const roles = (req.user as { roles?: string[] } | null)?.roles ?? []
      if (roles.includes('admin')) return true
      // Everyone else may edit only their own profile.
      return req.user ? req.user.id === id : false
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
          'Staff create and edit all content. Admin additionally manages accounts, QR codes and commercial flags. Businesses never get logins.',
      },
    },
    { name: 'phone', type: 'text' },
  ],
}
