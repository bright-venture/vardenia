import type { Access, CollectionConfig } from 'payload'
import { isStaff, isStaffFieldLevel, isStaffUser } from '../access/index'
import { notifyTeamOfStaffRequest } from '../hooks/notifyTeamOfStaffRequest'

/**
 * Requests for hostesses or waiters, from the Event Staff section (18 November
 * 2026).
 *
 * Event Staff has no listings: a signed-in guest fills in a form and the
 * Vardenia team answers. Created only through POST /booking/staff-request,
 * which takes the guest from the session; the team works the request here,
 * moving its status from New to Contacted, then Confirmed or Declined.
 *
 * A guest can read their own requests (their account page lists them) and
 * nothing else; nobody but the team can change one.
 */

const ownOrStaff: Access = ({ req }) => {
  const { user } = req
  if (!user) return false
  if (isStaffUser(user)) return true
  if (user.collection === 'customers') return { customer: { equals: user.id } }
  return false
}

export const STAFF_REQUEST_STATUSES = ['new', 'contacted', 'confirmed', 'declined'] as const
export const EVENT_TYPES = ['wedding', 'private-dinner', 'corporate', 'other'] as const

export const StaffRequests: CollectionConfig = {
  slug: 'staff-requests',
  labels: { singular: 'Staff request', plural: 'Staff requests' },
  admin: {
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'role', 'eventDate', 'guests', 'name', 'status'],
    group: 'Bookings',
    description:
      'Requests for hostesses and waiters from the Event Staff section. Call or email the guest, then set the status.',
  },
  access: { read: ownOrStaff, create: isStaff, update: isStaff, delete: isStaff },
  hooks: { afterChange: [notifyTeamOfStaffRequest] },
  fields: [
    { name: 'reference', type: 'text', index: true, admin: { readOnly: true } },
    {
      name: 'role',
      label: 'Wanted',
      type: 'select',
      required: true,
      options: [
        { label: 'Hostesses', value: 'hostesses' },
        { label: 'Waiters', value: 'waiters' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: STAFF_REQUEST_STATUSES.map((value) => ({
        label: value.charAt(0).toUpperCase() + value.slice(1),
        value,
      })),
      admin: { position: 'sidebar' },
    },
    {
      name: 'customer',
      label: 'Guest account',
      type: 'relationship',
      relationTo: 'customers',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'eventType',
          label: 'Type of event',
          type: 'select',
          required: true,
          options: [
            { label: 'Wedding', value: 'wedding' },
            { label: 'Private dinner', value: 'private-dinner' },
            { label: 'Corporate', value: 'corporate' },
            { label: 'Other', value: 'other' },
          ],
        },
        { name: 'guests', label: 'Guests at the event', type: 'number', required: true, min: 1 },
        {
          name: 'staffWanted',
          label: 'Staff wanted',
          type: 'number',
          min: 1,
          admin: { description: 'Empty means the guest is not sure.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'eventDate', label: 'Date', type: 'text', required: true, index: true },
        { name: 'startTime', label: 'Starts at', type: 'text' },
        { name: 'hours', type: 'number', min: 1, max: 24 },
      ],
    },
    { name: 'venue', label: 'Area or venue', type: 'text', required: true },
    { name: 'notes', type: 'textarea' },
    { name: 'locale', type: 'text', admin: { readOnly: true } },
    {
      name: 'internalNotes',
      type: 'textarea',
      access: { read: isStaffFieldLevel },
      admin: { description: 'For the team only. Never shown to the guest.' },
    },
  ],
}
