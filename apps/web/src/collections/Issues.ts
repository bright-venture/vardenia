import { APIError, type CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff, isStaffFieldLevel } from '../access/index'
import { DEFAULT_LISTING_TOTAL, totalProblem } from '@vardenia/core'
import { slugField } from '../fields/slug'
import { markMediaAttached } from '../hooks/markMediaAttached'

/** Why the listing total cannot drop to this value, given the issue's ranges. */
export function checkListingTotal(total: number, ranges: readonly { to: number }[]): string | null {
  return totalProblem(
    total,
    ranges.reduce((high, r) => Math.max(high, r.to), 0),
  )
}

/** A print edition. The digital archive and the QR attribution both hang off this. */
export const Issues: CollectionConfig = {
  slug: 'issues',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'issueNumber', 'publishedAt'],
    group: 'Magazine',
  },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin },
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        const total = data?.listingTotal
        if (typeof total !== 'number' || originalDoc?.id === undefined || !req?.payload) return data
        const ranges = await req.payload.find({
          collection: 'listing-ranges',
          where: { issue: { equals: originalDoc.id } },
          limit: 0,
          pagination: false,
          depth: 0,
          overrideAccess: true,
        })
        const problem = checkListingTotal(total, ranges.docs as unknown as { to: number }[])
        // Public 400, so the admin shows the reason rather than a hidden 500.
        if (problem) throw new APIError(problem, 400, null, true)
        return data
      },
    ],
    // Staff may use a partner's photo as a cover; it becomes public with it.
    afterChange: [markMediaAttached],
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField('title'),
    { name: 'issueNumber', label: 'Issue no.', type: 'number', required: true, unique: true },
    { name: 'season', type: 'text', localized: true, admin: { placeholder: 'Summer 2026' } },
    { name: 'cover', type: 'upload', relationTo: 'media', required: true },
    {
      name: 'publishedAt',
      label: 'Published on',
      type: 'date',
      required: true,
      admin: { date: { displayFormat: 'd MMM yyyy' } },
    },
    { name: 'pageCount', label: 'Pages', type: 'number', defaultValue: 100, min: 1 },
    {
      name: 'printRun',
      label: 'Copies printed',
      type: 'number',
      min: 0,
      // Staff-only. Actual circulation is commercial intelligence: it is the
      // denominator in every scan-rate figure, and not a number an advertiser
      // or a competitor should be able to scrape while rates are being agreed.
      access: { read: isStaffFieldLevel },
      admin: { description: 'Copies printed. Used to compute scan rate per thousand copies.' },
    },
    {
      name: 'listingTotal',
      label: 'Listing numbers in this issue',
      type: 'number',
      // Not required: issues made before this field existed hold null, read as the default.
      defaultValue: DEFAULT_LISTING_TOTAL,
      min: 1,
      admin: {
        step: 1,
        description:
          'How many numbers the printed issue has. Each governorate takes a block of them under Listing number ranges.',
      },
    },
    {
      // Shows how much of the total the governorates' blocks cover; nothing
      // stored. See components/admin/ListingAllocation.
      name: 'listingAllocation',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/ListingAllocation#ListingAllocation' },
      },
    },
    {
      name: 'digitalEdition',
      label: 'Digital edition (PDF)',
      type: 'upload',
      // Its own library, where PDFs may be up to 200 MB (collections/Editions).
      relationTo: 'editions',
      admin: {
        description:
          'The full issue as a PDF, read on the issue page like a book. Upload it here or pick one from Magazine PDFs (up to 200 MB).',
      },
    },
  ],
}
