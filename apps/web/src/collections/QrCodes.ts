import type { CollectionConfig } from 'payload'
import { DEFAULT_PLACEMENT, QR_PLACEMENTS, QR_TARGET_TYPES, TAXONOMY } from '@vardenia/core'
import { isAdmin, isStaff } from '../access/index'
import { committedReason, protectPrintedCodes } from '../hooks/protectPrintedCodes'
import {
  revalidateQrCodesAfterChange,
  revalidateQrCodesAfterDelete,
} from '../hooks/revalidateQrCodes'
import { isUsableExternalUrl, normalizeExternalUrl } from '../lib/external-url'
import { allocateCode } from '../lib/allocate-code'

/**
 * A printed code is permanent; its destination is not.
 *
 * `code` is immutable after creation (enforced below). Everything else can be
 * re-pointed, which is what makes the print product durable: a restaurant that
 * rebrands keeps its code, and the 20,000 magazines already in circulation keep
 * working.
 */
/**
 * Where a code leads is fixed once it is printed.
 *
 * "Printed" is what the delete guard already means by it: assigned to an issue,
 * or scanned at least once. Before this, a printed code could be pointed at
 * another listing from the form, and every copy of the magazine in circulation
 * would send its readers to the wrong place with nothing on the page to say so.
 * A printed code is retired by unticking Active, never re-aimed.
 *
 * Field update access, so the admin shows the fields read-only and an API
 * write leaves them as they were. One exception: a printed code whose listing
 * is empty may be given one, which is how an orphaned code finds its listing
 * again. The importer and the relink pass overrideAccess and are unaffected.
 */
const destinationOpen = ({ doc }: { doc?: Record<string, unknown> }) =>
  !doc || committedReason(doc as never) === null

const listingOpen = ({ doc }: { doc?: Record<string, unknown> }) =>
  destinationOpen({ doc }) || !doc?.business

const TARGET_LABELS: Record<string, string> = {
  business: 'A listing',
  article: 'A magazine article',
  issue: 'A magazine issue',
  category: 'A category page',
  external: 'Another website',
  home: 'The Vardenia home page',
}

export const QrCodes: CollectionConfig = {
  slug: 'qr-codes',
  // Payload titles a collection from its slug, which gives "Qr Codes".
  labels: { singular: 'QR Code', plural: 'QR Codes' },
  admin: {
    // Can be grouped by listing in the list view (Group by, then Business), so
    // each listing's entries sit together. See the links on the admin home.
    groupBy: true,
    // Opens on one folder per listing; a folder is the normal list, filtered
    // to that listing. See components/admin/FolderListView.
    components: {
      views: { list: { Component: '/components/admin/FolderListView#FolderListView' } },
    },
    useAsTitle: 'code',
    defaultColumns: ['code', 'targetType', 'placement', 'scanCount', 'active'],
    group: 'Directory',
  },
  access: {
    read: isStaff,
    create: isStaff,
    update: isStaff,
    delete: isAdmin,
  },
  hooks: {
    beforeDelete: [protectPrintedCodes],
    // The /g redirect caches each code's destination. Retargeting one has to
    // take effect on the next scan, not an hour later - see revalidateQrCodes.
    afterChange: [revalidateQrCodesAfterChange],
    afterDelete: [revalidateQrCodesAfterDelete],
  },
  fields: [
    {
      name: 'printable',
      type: 'ui',
      admin: { components: { Field: '/components/admin/QrPreview#QrPreview' } },
    },
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Immutable. This is what gets printed.' },
      /**
       * Minted here, when the create form is built.
       *
       * It has to happen this early rather than in a save hook. The field is
       * required *and* read-only, so the admin panel's own client-side check
       * refuses an empty one before any request leaves the browser - which is
       * exactly what happened the first time anyone tried to create a code by
       * hand: "This field is required" over a box nobody is allowed to type in.
       * Every code until then had been minted by ensureQrCode from a listing,
       * so the admin path had never been walked.
       *
       * Abandoning the form costs nothing. Nothing is written until save, and
       * the code space is 34 billion wide.
       */
      defaultValue: async ({ req }) => (req?.payload ? await allocateCode(req.payload) : undefined),
      hooks: {
        beforeChange: [
          async ({ value, originalDoc, operation, req }) => {
            // Immutable once it exists. This is the whole premise of the printed
            // product: the paper cannot be reissued, so the code cannot change.
            if (operation === 'update' && originalDoc?.code) return originalDoc.code
            if (value) return value

            /**
             * Nothing supplied. The admin panel cannot reach here because of the
             * default above, so this is the REST and local API path - a seed, a
             * script, or an integration - and it is worth serving rather than
             * rejecting.
             */
            const minted = req?.payload ? await allocateCode(req.payload) : null
            if (!minted) {
              throw new Error(
                'Could not allocate a unique QR code after several attempts. Nothing was saved.',
              )
            }
            return minted
          },
        ],
      },
    },
    {
      name: 'targetType',
      type: 'select',
      required: true,
      defaultValue: 'business',
      options: QR_TARGET_TYPES.map((value) => ({ label: TARGET_LABELS[value] ?? value, value })),
      access: { update: destinationOpen },
      admin: {
        description:
          'What the code opens. Pick "The Vardenia home page" for a code on a cover, a card or a window sticker. Everything else needs the matching field below. Fixed once the code is printed (given an issue, or scanned): to stop a printed code, untick Active.',
      },
    },
    {
      name: 'business',
      label: 'Listing',
      type: 'relationship',
      relationTo: 'businesses',
      index: true,
      access: { update: listingOpen },
      admin: { condition: (data) => data?.targetType === 'business' },
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'articles',
      access: { update: destinationOpen },
      admin: { condition: (data) => data?.targetType === 'article' },
    },
    {
      name: 'category',
      type: 'select',
      access: { update: destinationOpen },
      options: TAXONOMY.map((entry) => ({ label: entry.en, value: entry.slug })),
      admin: {
        condition: (data) => data?.targetType === 'category',
        description: 'Opens the directory filtered to this category.',
      },
      validate: (value: unknown, { siblingData }: { siblingData?: { targetType?: string } }) => {
        if (siblingData?.targetType !== 'category') return true
        return value ? true : 'Pick a category, or the code will resolve to nothing.'
      },
    },
    {
      name: 'externalUrl',
      label: 'Web address',
      type: 'text',
      access: { update: destinationOpen },
      admin: {
        condition: (data) => data?.targetType === 'external',
        description: 'Full web address. A bare domain like leroyal.com.lb is fine.',
      },
      /**
       * Validated because an unusable value here is unrecoverable once printed.
       * `Response.redirect` throws on anything that is not an absolute URL, and
       * a throw in the scan route is a 500 - so a domain typed without https://
       * used to turn a printed code into a hard error for every reader.
       */
      validate: (value: unknown, { siblingData }: { siblingData?: { targetType?: string } }) => {
        if (siblingData?.targetType !== 'external') return true
        if (!value) return 'Required when the target type is external.'
        return (
          isUsableExternalUrl(value) ||
          'Must be a reachable http(s) address, for example https://leroyal.com.lb/spa'
        )
      },
      hooks: {
        // Store the normalised form, so what resolves at scan time is exactly
        // what was checked at save time.
        beforeChange: [
          ({ value, siblingData }) =>
            (siblingData as { targetType?: string })?.targetType === 'external'
              ? (normalizeExternalUrl(value) ?? value)
              : value,
        ],
      },
    },
    {
      name: 'placement',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_PLACEMENT,
      options: QR_PLACEMENTS.map((value) => ({
        label: value === 'magazine-page' ? 'Magazine page' : value,
        value,
      })),
      admin: {
        description:
          'Codes are printed in the magazine and nowhere else, so leave this on magazine-page. The other values are surfaces we have not shipped; picking one now records something that is not true.',
      },
    },
    {
      name: 'issue',
      type: 'relationship',
      relationTo: 'issues',
      admin: {
        // Previously hidden unless placement was magazine-page, which combined
        // with a 'digital' default meant the field never appeared at all - so no
        // code was ever tied to an issue, and the print sheet had nothing to
        // filter on. It is the most important field here; it is always shown.
        description:
          'Which printed issue carries this code. Set it before the issue goes to press: it is what the print sheet filters on, and what marks the code as permanent.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Inactive codes land on a "this listing has moved" page rather than 404 - never delete a printed code.',
      },
    },
    {
      name: 'scanCount',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Scans so far. Each one is listed under Reports, QR scans.',
      },
    },
  ],
}
