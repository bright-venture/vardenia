import { APIError } from 'payload'
import type { CollectionBeforeValidateHook } from 'payload'

/**
 * Rejecting needs a reason, whichever way it is done. The Reject submission
 * control (lib/place-rejection) writes the reason in the same save; setting
 * the Status dropdown to Rejected by hand would skip it, so it is refused
 * until the reason is there. A submission that is already rejected is left
 * alone (older ones have no reason).
 */
export const requireRejectionReason: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const asked = (data?.submission as { status?: string } | undefined)?.status
  const before = (originalDoc?.submission as { status?: string } | undefined)?.status
  if (asked !== 'rejected' || before === 'rejected') return data
  const reason =
    (data?.submission as { rejectionReason?: unknown } | undefined)?.rejectionReason ??
    (originalDoc?.submission as { rejectionReason?: unknown } | undefined)?.rejectionReason
  if (typeof reason === 'string' && reason.trim()) return data
  throw new APIError(
    'A rejection needs a reason. Use the Reject submission button on the Submission tab.',
    400,
    null,
    true,
  )
}
