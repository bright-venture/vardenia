import type { CollectionBeforeChangeHook } from 'payload'
import { BUSINESS_USER_COLLECTION, STAFF_COLLECTION } from '../access/index'

/**
 * When a venue first answered a booking request.
 *
 * The listing page says "usually answers within 3 hours", and that is only
 * worth saying if it is true. Nothing recorded the moment of an answer: the
 * status changed and `updatedAt` moved with every later edit too.
 *
 * Set here, on the server, and nowhere else:
 *
 * - the first time a request leaves `pending`, by the venue (a partner
 *   account) or by staff answering for it on the phone;
 * - never on create, so a booking confirmed automatically by the listing's
 *   own rule, or entered by staff after the fact, is not counted as an answer;
 * - never for a guest cancelling their own request, or a system update with no
 *   user behind it (closing an account), since neither is the venue answering;
 * - and never from the request body. Whatever a caller sends is replaced by
 *   the stored value, so a venue cannot make itself look quicker.
 */
export const stampAnsweredAt: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data) return data

  if (operation === 'create') {
    data.answeredAt = null
    return data
  }

  const stored = (originalDoc as { answeredAt?: string | null } | undefined)?.answeredAt ?? null
  const before = (originalDoc as { status?: string } | undefined)?.status
  const after = (data.status as string | undefined) ?? before
  const actor = req.user?.collection

  const answering =
    before === 'pending' &&
    after !== 'pending' &&
    (actor === BUSINESS_USER_COLLECTION || actor === STAFF_COLLECTION)

  data.answeredAt = stored ?? (answering ? new Date().toISOString() : null)
  return data
}
