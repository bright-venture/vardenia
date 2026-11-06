import { APIError, type CollectionBeforeChangeHook, type CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff } from '../access/index'

/**
 * The PDF of each magazine issue, read on the site in the magazine viewer
 * (components/magazine/MagazineReader, through /read/issue/[slug]).
 *
 * # Its own library, so only magazines get the large limit
 *
 * A full issue is around 80 MB. Everything else the team uploads is a photo,
 * held to 25 MB (payload.config `upload.limits`). Raising that for one kind of
 * file would raise it for every photo, so issue PDFs live here instead, with
 * their own limit (EDITION_MAX_BYTES) and their own storage bucket, which
 * Supabase also caps per bucket.
 *
 * They also travel differently. Netlify refuses a request body over about
 * 6 MB, so a photo goes through the server and a magazine cannot. This
 * collection alone uploads straight from the browser to storage
 * (`clientUploads` in payload.config); the server only records the file.
 *
 * Public, like the photos: an issue is meant to be read. Staff upload and
 * replace them; only an admin deletes one, since an issue page points at it.
 */

/** The largest magazine PDF accepted. The `editions` bucket is set to the same. */
export const EDITION_MAX_BYTES = 200 * 1024 * 1024

/**
 * Refuses a PDF over the limit, with a readable message.
 *
 * The bucket refuses it too, but only after the upload, and with a storage
 * error nobody on the team should have to decode. `filesize` is what Payload
 * records for the file, from the browser's upload as much as from the server's.
 */
export const limitEditionSize: CollectionBeforeChangeHook = ({ data }) => {
  const size = typeof data?.filesize === 'number' ? data.filesize : 0
  if (size > EDITION_MAX_BYTES) {
    const mb = Math.round(size / (1024 * 1024))
    throw new APIError(
      `That PDF is ${mb} MB. Magazine PDFs can be up to 200 MB: export a lighter version (smaller images) and try again.`,
      413,
    )
  }
  return data
}

export const Editions: CollectionConfig = {
  slug: 'editions',
  labels: { singular: 'Magazine PDF', plural: 'Magazine PDFs' },
  admin: {
    group: 'Magazine',
    useAsTitle: 'title',
    defaultColumns: ['title', 'filename', 'filesize', 'updatedAt'],
    description:
      'The PDF of each issue, read on the site like a book. PDF only, up to 200 MB. Attach it to the issue in its Digital edition field.',
  },
  access: {
    read: anyone,
    create: isStaff,
    update: isStaff,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [limitEditionSize],
  },
  upload: {
    // Local development without a bucket keeps the files here; the reader
    // reads them from the same folder (app/read/issue).
    staticDir: 'public/editions',
    mimeTypes: ['application/pdf'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'Which edition this is, for example "Keserwan 2026".' },
    },
  ],
}
