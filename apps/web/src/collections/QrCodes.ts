import type { CollectionConfig } from 'payload'
import { DEFAULT_PLACEMENT, QR_PLACEMENTS, QR_TARGET_TYPES, TAXONOMY } from '@vardenia/core'
import { isAdmin, isStaff } from '../access/index'
import { protectPrintedCodes } from '../hooks/protectPrintedCodes'
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
export const QrCodes: CollectionConfig = {
  slug: 'qr-codes',
  // Payload titles a collection from its slug, which gives "Qr Codes".
  labels: { singular: 'QR Code', plural: 'QR Codes' },
  admin: {
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
      options: QR_TARGET_TYPES.map((value) => ({ label: value, value })),
      admin: {
        description:
          'What the code opens. Pick "home" for a generic code that opens vardenia.com itself - a cover, a card, a window sticker - and leave the target fields below empty. Everything else needs the matching field filled in.',
      },
    },
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      index: true,
      admin: { condition: (data) => data?.targetType === 'business' },
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'articles',
      admin: { condition: (data) => data?.targetType === 'article' },
    },
    {
      name: 'category',
      type: 'select',
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
      type: 'text',
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
      options: QR_PLACEMENTS.map((value) => ({ label: value, value })),
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
        description: 'Denormalised running total. Detailed breakdown lives in Scan Events.',
      },
    },
  ],
}
