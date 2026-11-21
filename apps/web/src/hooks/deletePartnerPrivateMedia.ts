import { APIError, type CollectionBeforeDeleteHook } from 'payload'

/**
 * A deleted partner's private files are deleted with them.
 *
 * Media.uploadedBy points at the partner with `on delete set null`, and the
 * public read rule (access mediaRead) treats a file with no uploader as a team
 * upload, which is public. So a partner's file that no page uses yet (private
 * while the partner existed: only staff and that partner read it) would become
 * public the moment the partner row went. No schema change: those files are
 * removed first, here.
 *
 * Only files of that partner that are not attached (`attached` false, or
 * never set). A file a page uses stays: it is public already, and the page
 * needs it.
 *
 * Fails safe: same `req`, so the same transaction as the partner delete, and
 * access overridden (a partner file is not the admin's to see otherwise). A
 * bulk delete does not throw when one file is refused (hooks/blockMediaInUse,
 * a required field still pointing at it); it lists the refusal in `errors`.
 * Any refusal throws here, which aborts the partner delete and rolls the
 * transaction back, rather than leaving that file behind to turn public.
 *
 * The stored objects (S3) of files already removed are not restored by a
 * rollback; the partner was being deleted anyway, so that is accepted.
 */
export const deletePartnerPrivateMedia: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const result = await req.payload.delete({
    collection: 'media',
    where: {
      and: [
        { uploadedBy: { equals: id } },
        { or: [{ attached: { equals: false } }, { attached: { exists: false } }] },
      ],
    },
    overrideAccess: true,
    req,
  })
  const errors = ((result as { errors?: unknown[] }).errors ?? []) as { message?: unknown }[]
  if (errors.length > 0) {
    const first = typeof errors[0]?.message === 'string' ? ` ${errors[0].message}` : ''
    throw new APIError(
      `The partner was not deleted: ${errors.length} of their files could not be deleted.${first}`,
      400,
    )
  }
}
