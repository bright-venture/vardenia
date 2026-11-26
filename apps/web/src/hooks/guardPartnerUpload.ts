import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
} from 'payload'
import { BUSINESS_USER_COLLECTION } from '../access/index'
import { lockPartnerUploads } from '../lib/upload-lock'

/**
 * A partner's upload, for their own listing (Task 3, 20 November 2026).
 *
 * Partners have been able to create media since room-type photos (17 November
 * 2026); now they also add photos, a logo and a menu to their listing. The
 * collection-wide size limit (hooks/limitUploadSize) and unguessable filename
 * (hooks/unguessableFilename) apply to them as to staff. On top of those, for a
 * business-user only:
 *
 *  - Photos and PDF only. The team may upload video; a partner may not. The
 *    first bytes are checked as well as the declared type, so a video or an
 *    SVG renamed `.png` is refused here rather than trusted.
 *  - At most PARTNER_UPLOADS_PER_HOUR uploads an hour per account, counted
 *    from the media table itself, so the limit holds across server instances
 *    without another table, under a per-partner advisory lock held until the
 *    create commits (lib/upload-lock), so parallel uploads cannot all pass the
 *    count. The REST route's per-address limit still applies.
 *  - The row records who uploaded it (`uploadedBy`, stampUploader below), which
 *    is what lets a partner attach only their own uploads
 *    (lib/partner-media) and keeps an unattached upload out of other people's
 *    reads (access mediaRead).
 *
 * Staff and the server's own writes (`overrideAccess`) are untouched.
 */

export const PARTNER_UPLOADS_PER_HOUR = 60

const HOUR_MS = 60 * 60 * 1000

const PARTNER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf']

const ascii = (bytes: Buffer, from: number, to: number) =>
  bytes.subarray(from, to).toString('latin1')

/** The type the first bytes say this is, among the ones a partner may send. */
function sniff(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 8 && ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf'
  return null
}

const isPartner = (user: unknown) =>
  (user as { collection?: string } | null)?.collection === BUSINESS_USER_COLLECTION

export const guardPartnerUpload: CollectionBeforeOperationHook = async ({
  args,
  operation,
  overrideAccess,
  req,
}) => {
  if (operation !== 'create') return args
  if (overrideAccess === true || (args as { overrideAccess?: boolean })?.overrideAccess === true) {
    return args
  }
  const user = req?.user as { id?: string | number } | null | undefined
  if (!user || !isPartner(user) || user.id === undefined) return args

  const file = req.file as { data?: Buffer; mimetype?: string } | undefined
  if (!file || !Buffer.isBuffer(file.data) || file.data.length === 0) {
    throw new APIError('Choose a photo or a PDF to upload.', 400, null, true)
  }
  const declared = String(file.mimetype ?? '').toLowerCase()
  const actual = sniff(file.data)
  if (!PARTNER_TYPES.includes(declared) || actual !== declared) {
    throw new APIError(
      'Upload a photo (JPEG, PNG, WebP or AVIF) or a PDF. Other files cannot be added to a listing.',
      415,
      null,
      true,
    )
  }

  // Held until this create commits, so parallel uploads count one by one.
  await lockPartnerUploads(req, user.id)
  const recent = await req.payload.count({
    collection: 'media',
    where: {
      and: [
        { uploadedBy: { equals: user.id } },
        { createdAt: { greater_than: new Date(Date.now() - HOUR_MS).toISOString() } },
      ],
    },
    overrideAccess: true,
    req,
  })
  if (recent.totalDocs >= PARTNER_UPLOADS_PER_HOUR) {
    throw new APIError(
      `You have uploaded ${PARTNER_UPLOADS_PER_HOUR} files in the last hour. Try again later.`,
      429,
      null,
      true,
    )
  }

  return args
}

/**
 * Records the partner who uploaded a file, on create only.
 *
 * The fields carry `create: () => false` access, which Payload applies before
 * collection hooks run, so whatever the body said about them is already gone;
 * this sets the true values. A partner's file is not attached yet and is
 * supplied by the business. A team upload is left exactly as before.
 */
export const stampUploader: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (operation !== 'create' || !data) return data
  const user = req?.user as { id?: string | number } | null | undefined
  if (!user || !isPartner(user) || user.id === undefined) return data
  return { ...data, uploadedBy: user.id, attached: false, usageRights: 'supplied' }
}
