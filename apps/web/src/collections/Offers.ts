import type { CollectionConfig } from 'payload'
import { isStaff, ownBusinessRelationOnly, publishedOrStaff } from '../access/index'
import { slugField } from '../fields/slug'

/**
 * Digital coupons and time-limited promotions.
 *
 * Gated on listing tier (see `TIER_CAPABILITIES.offers`) - this is one of the
 * concrete things an advertiser buys when they move off the free tier.
 */
export const Offers: CollectionConfig = {
  slug: 'offers',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'business', 'startsAt', 'endsAt'],
    group: 'Directory',
  },
  versions: { drafts: true },
  access: {
    read: publishedOrStaff,
    create: isStaff,
    update: ownBusinessRelationOnly('business'),
    delete: isStaff,
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField('title'),
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
    },
    { name: 'description', type: 'textarea', localized: true },
    { name: 'image', type: 'upload', relationTo: 'media' },
    {
      name: 'terms',
      type: 'textarea',
      localized: true,
      admin: { description: 'Shown in full before redemption. Keep it honest and specific.' },
    },
    { name: 'startsAt', type: 'date', required: true, index: true },
    {
      name: 'endsAt',
      type: 'date',
      required: true,
      index: true,
      admin: { description: 'Expired offers stop rendering automatically.' },
    },
    {
      name: 'redemptionType',
      type: 'select',
      defaultValue: 'show-screen',
      options: [
        { label: 'Show screen in venue', value: 'show-screen' },
        { label: 'Promo code', value: 'promo-code' },
        { label: 'Link', value: 'link' },
      ],
    },
    {
      name: 'promoCode',
      type: 'text',
      admin: { condition: (data) => data?.redemptionType === 'promo-code' },
    },
    {
      name: 'redemptionUrl',
      type: 'text',
      admin: { condition: (data) => data?.redemptionType === 'link' },
    },
  ],
}
