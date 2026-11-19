import { APIError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'
import { isStaff } from '../access/index'

/**
 * A business asking for a place in the printed magazine (19 November 2026).
 *
 * Businesses reach the request page (/magazine-places) from a QR code; the form
 * there is still to come, so for now requests are entered by the team here.
 *
 * # Four statuses
 *
 * - Draft: the request, waiting for the team.
 * - Published: accepted, with a contract. Needs the contract's end date.
 * - Rejected: refused. Kept as a record; the place is free again.
 * - Expired: the contract ended. Set automatically the morning after the
 *   contract end date (lib/place-requests, run by the daily job).
 *
 * Draft can become Published or Rejected; Published can become Expired; an
 * Expired place can be Published again when the business renews (19 November
 * 2026), with a new contract end date. Rejected is final.
 */

export const PLACE_STATUSES = ['draft', 'published', 'rejected', 'expired'] as const
type PlaceStatus = (typeof PLACE_STATUSES)[number]

const MOVES: Record<PlaceStatus, readonly PlaceStatus[]> = {
  draft: ['published', 'rejected'],
  published: ['expired'],
  rejected: [],
  // A renewal: the business signs a new contract.
  expired: ['published'],
}

const guardPlaceRequest: CollectionBeforeValidateHook = ({ data, originalDoc, operation }) => {
  if (!data) return data
  const before = (originalDoc?.status ?? 'draft') as PlaceStatus
  const after = (data.status ?? before) as PlaceStatus

  if (operation === 'create' && after !== 'draft') {
    throw new APIError('A new request starts as Draft.', 400)
  }
  if (operation === 'update' && after !== before && !MOVES[before].includes(after)) {
    throw new APIError(
      before === 'rejected'
        ? 'This request was rejected. Make a new request instead.'
        : `A ${before} request can only become ${MOVES[before].join(' or ')}.`,
      400,
    )
  }
  if (after === 'published') {
    const ends = data.contractEndsAt ?? originalDoc?.contractEndsAt
    if (!ends) throw new APIError('Set the contract end date before publishing.', 400)
    // Publishing, or renewing, with an end date already past would expire
    // again the next morning.
    if (after !== before && new Date(String(ends)).getTime() < Date.now() - 86_400_000) {
      throw new APIError('The contract end date has passed. Set the new end date.', 400)
    }
  }
  return data
}

export const PlaceRequests: CollectionConfig = {
  slug: 'place-requests',
  labels: { singular: 'Magazine place request', plural: 'Magazine place requests' },
  admin: {
    useAsTitle: 'businessName',
    defaultColumns: ['businessName', 'issue', 'placeNumber', 'status', 'contractEndsAt'],
    group: 'Magazine',
    description:
      'Businesses asking for a place in the magazine. Draft, then Published (accepted, with a contract) or Rejected. Published becomes Expired after the contract ends, and can be Published again to renew.',
  },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isStaff },
  hooks: { beforeValidate: [guardPlaceRequest] },
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Expired', value: 'expired' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Draft can become Published or Rejected. Published becomes Expired after the contract ends. To renew, set a new contract end date and choose Published again.',
      },
    },
    { name: 'businessName', label: 'Business', type: 'text', required: true, maxLength: 160 },
    {
      type: 'row',
      fields: [
        {
          name: 'issue',
          label: 'Magazine issue',
          type: 'relationship',
          relationTo: 'issues',
          index: true,
        },
        { name: 'placeNumber', label: 'Place', type: 'number', min: 1, index: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'contactName', label: 'Contact person', type: 'text', maxLength: 120 },
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'text', maxLength: 40 },
      ],
    },
    {
      name: 'listing',
      type: 'relationship',
      relationTo: 'businesses',
      admin: { description: 'The listing, once it exists.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'contractStartsAt',
          label: 'Contract starts',
          type: 'date',
          admin: { date: { displayFormat: 'd MMM yyyy' } },
        },
        {
          name: 'contractEndsAt',
          label: 'Contract ends',
          type: 'date',
          index: true,
          admin: {
            date: { displayFormat: 'd MMM yyyy' },
            description: 'Needed to publish. The morning after, the status becomes Expired.',
          },
        },
      ],
    },
    { name: 'notes', label: 'What they asked for', type: 'textarea', maxLength: 4000 },
    { name: 'internalNotes', type: 'textarea', admin: { description: 'For the team only.' } },
  ],
}
