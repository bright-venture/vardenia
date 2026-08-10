import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminFieldLevel, isStaff } from '../access/index'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
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
      defaultValue: ['advertiser'],
      // Only an admin can grant roles - otherwise an advertiser could promote
      // themselves to editor through the API.
      access: { create: isAdminFieldLevel, update: isAdminFieldLevel },
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Sales', value: 'sales' },
        { label: 'Advertiser', value: 'advertiser' },
      ],
    },
    {
      name: 'managedBusinesses',
      type: 'relationship',
      relationTo: 'businesses',
      hasMany: true,
      access: { create: isAdminFieldLevel, update: isAdminFieldLevel },
      admin: {
        description: 'Listings this advertiser may edit. Ignored for staff roles.',
        condition: (data) => data?.roles?.includes('advertiser'),
      },
    },
    { name: 'phone', type: 'text' },
  ],
}
