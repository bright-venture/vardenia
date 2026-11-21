import type { Access, CollectionConfig } from 'payload'
import {
  BUSINESS_USER_COLLECTION,
  isAdmin,
  isStaff,
  isStaffFieldLevel,
  isStaffUser,
  mediaRead,
  ownedBusinessIds,
} from '../access/index'
import { blockMediaInUse } from '../hooks/blockMediaInUse'
import { guardPartnerUpload, stampUploader } from '../hooks/guardPartnerUpload'
import { unguessableFilename } from '../hooks/unguessableFilename'
import { PHOTO_MAX_BYTES, limitUploadSize } from '../hooks/limitUploadSize'
import { revalidateMediaAfterChange, revalidateMediaAfterDelete } from '../hooks/revalidateMedia'

/**
 * Photography is the product for a luxury title, so the image sizes here are
 * generous and alt text matters - an inaccessible premium magazine is still an
 * inaccessible magazine, and Google reads alt text on every listing. It is
 * optional for now only so photographs can be bulk-uploaded first and
 * described afterwards; see the field below.
 */
const WEBP = { format: 'webp', options: { quality: 82 } } as const

/**
 * Partners may upload, so they can add photos of their own room types (17
 * November 2026) and photos, a logo and a menu to their own listing (20
 * November 2026). Only uploading: changing or removing a file stays with the
 * team, so a partner cannot touch an image used anywhere else. The size limit
 * and the unguessable filename below apply to their uploads as to ours, and
 * hooks/guardPartnerUpload adds theirs: photos and PDF only, a rate limit, and
 * the uploader recorded on the row.
 */
const staffOrPartner: Access = ({ req }) =>
  isStaffUser(req.user) || ownedBusinessIds(req.user).length > 0

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Magazine' },
  access: {
    // Team uploads and anything attached to a page are public, as before; a
    // partner's upload that is on no page yet is read only by staff and the
    // partner. See access mediaRead and hooks/markMediaAttached.
    read: mediaRead,
    create: staffOrPartner,
    update: isStaff,
    // A photo may be on a live listing or article, and deleting removes the
    // file for good: admin only (20 November 2026, auth audit step 6).
    delete: isAdmin,
  },
  hooks: {
    // Renames every upload before it is stored, so a file cannot be reached by
    // guessing its name. See hooks/unguessableFilename.
    // 25 MB, as before: the site-wide limit is now magazine PDFs' 200 MB.
    // A partner's upload is also checked for type and rate. See
    // hooks/guardPartnerUpload.
    beforeOperation: [
      limitUploadSize(PHOTO_MAX_BYTES, 'Photos and videos'),
      guardPartnerUpload,
      unguessableFilename,
    ],
    beforeChange: [stampUploader],
    beforeDelete: [blockMediaInUse],
    afterChange: [revalidateMediaAfterChange],
    afterDelete: [revalidateMediaAfterDelete],
  },

  upload: {
    // Storage adapter is swapped to S3/R2 in payload.config.ts when configured.
    staticDir: 'public/media',

    // The file size ceiling is not here. Payload takes it once for every
    // collection, on the top-level `upload` config - see payload.config.ts.
    /**
     * Listed explicitly rather than `image/*`.
     *
     * That wildcard included `image/svg+xml`, and an SVG is a document that can
     * carry `<script>`. Any staff account - or anyone who obtains one - could
     * upload stored XSS. The only thing preventing it from running against
     * Vardenia was that uploads happen to be served from supabase.co rather
     * than our own domain, which is a coincidence of the storage choice and not
     * a control anyone decided on.
     *
     * These are the formats sharp actually processes into the sizes declared
     * below, plus mp4 for video and PDF for an issue's digital edition. Note
     * that HEIC, which is what an iPhone produces by default, is absent: it
     * would need a sharp build with libheif. Editors shooting on a phone should
     * export JPEG.
     */
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'video/mp4',
      'application/pdf',
    ],
    focalPoint: true,
    // `formatOptions` below converts the original only. Each size needs its own
    // copy or it keeps the source format, which quietly gave us JPEG thumbnails
    // off a WebP original - the sizes are what actually get served, so that is
    // the whole saving lost.
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre', formatOptions: WEBP },
      { name: 'card', width: 800, height: 600, position: 'centre', formatOptions: WEBP },
      { name: 'portrait', width: 900, height: 1200, position: 'centre', formatOptions: WEBP },
      { name: 'hero', width: 2000, height: 1125, position: 'centre', formatOptions: WEBP },
      { name: 'og', width: 1200, height: 630, position: 'centre', formatOptions: WEBP },
    ],
    formatOptions: WEBP,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      // Optional for now, so photographs can be bulk-uploaded and described
      // afterwards. A picture without one renders with alt="" (treated as
      // decorative by screen readers), and search engines get no description,
      // so fill it in before the picture goes on a listing.
      localized: true,
      admin: {
        description:
          'Describe the image for screen readers and search engines. Optional for now, but fill it in before the picture is used on a listing.',
      },
    },
    { name: 'caption', type: 'text', localized: true },
    {
      name: 'credit',
      type: 'text',
      admin: { description: 'Photographer or rights holder. Required for licensed imagery.' },
    },
    {
      name: 'usageRights',
      type: 'select',
      defaultValue: 'owned',
      options: [
        { label: 'Owned by Vardenia', value: 'owned' },
        { label: 'Licensed', value: 'licensed' },
        { label: 'Supplied by business', value: 'supplied' },
      ],
      admin: {
        description:
          'Track this. Reusing a supplied photo in a paid ad without rights is a real liability.',
      },
    },
    {
      /**
       * The partner who uploaded this, empty for a team upload. Set only by
       * hooks/guardPartnerUpload (stampUploader); nobody writes it through the
       * API. Lets a partner attach only their own uploads (lib/partner-media);
       * the checks read it with overrideAccess.
       */
      name: 'uploadedBy',
      label: 'Uploaded by partner',
      type: 'relationship',
      relationTo: BUSINESS_USER_COLLECTION,
      index: true,
      // Staff-only to read: which partner uploaded what is nobody else's
      // business. The read rule (mediaRead) still filters on it, because an
      // access constraint is not checked against field read access.
      access: {
        read: isStaffFieldLevel,
        create: () => false,
        update: () => false,
      },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      /**
       * Whether a page uses this file. Only matters for a partner's upload,
       * which is hidden from everyone but staff and the partner until it is
       * attached (access mediaRead). Set by hooks/markMediaAttached when a
       * listing, room type, article or issue is saved pointing at it.
       */
      name: 'attached',
      label: 'Attached to a page',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: { create: () => false, update: isStaffFieldLevel },
      admin: {
        position: 'sidebar',
        description:
          "Set automatically when a page uses this file. Tick it by hand only for a partner's file used inside article text.",
      },
    },
  ],
}
