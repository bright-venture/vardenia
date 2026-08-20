import type { CollectionAfterChangeHook } from 'payload'
import type { BookingStatus } from '@vardenia/core'
import type { PayloadRequest } from 'payload'
import { outcomeFor, sendBookingOutcome, sendVenueCancellation } from '../lib/booking-email'
import { reportError } from '../lib/report'

/**
 * Tells the customer when the business answers.
 *
 * Until this existed the loop was open at exactly the point it mattered: a
 * customer got "we have passed your request on" and then nothing, whatever the
 * restaurant decided. They found out by turning up, or by not turning up to a
 * table that was waiting.
 *
 * # Why a hook rather than a call in the partner dashboard
 *
 * Because a booking is answered from three places already - the dashboard, the
 * admin panel, and a staff member fixing something over the phone - and will be
 * answered from more. A notification wired into one button is a notification
 * that silently does not happen from the other two.
 *
 * # It must never fail the write
 *
 * `afterChange` runs after the booking is saved. Throwing here would hand the
 * owner a 500 for a change that succeeded, and they would press Accept again on
 * a booking that is already confirmed. Every failure is reported and swallowed.
 */

/** Fields the hook needs off the saved document, none of which Payload types loosely enough. */
interface BookingDoc {
  business?: unknown
  id: number | string
  status?: BookingStatus
  reference?: string
  start?: string
  end?: string
  partySize?: number
  locale?: string
  customer?: unknown
}

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

export const notifyBookingStatus: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  /**
   * Only an update can be an answer. A booking created as `confirmed` - which
   * happens whenever `autoConfirm` is on - already had its confirmation sent by
   * the request route, and sending again from here would mean two identical
   * emails for one booking.
   */
  if (operation !== 'update') return doc

  const current = doc as BookingDoc
  const previous = previousDoc as BookingDoc

  const from = previous?.status
  const to = current?.status
  if (!from || !to) return doc

  const outcome = outcomeFor(from, to)
  if (!outcome) return doc

  const actor = req?.user?.collection

  /**
   * The venue is told when a booking it was holding is called off by anybody but
   * itself.
   *
   * This is the half a dashboard does not solve. A restaurant does not sit
   * refreshing a page, so without a message the table stays held for somebody
   * who decided last week not to come - and they find out when the evening is
   * over. An owner who cancelled it themselves already knows.
   */
  if (to === 'cancelled' && actor !== 'business-users') {
    await notifyVenue(current, from, req).catch(async (error) => {
      await reportError(error, {
        source: 'booking.venue-cancellation',
        extra: { booking: current.id },
      })
    })
  }

  /**
   * A customer who cancels their own booking is not told that their booking was
   * cancelled. They just did it, they watched it happen, and an email saying so
   * is the kind of message that trains people to stop reading ours.
   *
   * Checked on the collection rather than by comparing ids, because the question
   * is "did the person affected make this change", and a staff member cancelling
   * on a customer's behalf over the phone should still produce a record in the
   * customer's inbox.
   */
  if (actor === 'customers') return doc

  try {
    const customerId = idOf(current.customer)
    if (customerId === null) return doc

    /**
     * Fetched with access overridden. The hook runs as whoever made the change -
     * usually a business owner, who is not allowed to read the Customers
     * collection at all - so the ordinary path would find nothing and the email
     * would silently never send.
     */
    const customer = await req.payload.findByID({
      collection: 'customers',
      id: customerId,
      depth: 0,
      overrideAccess: true,
    })

    const email = String((customer as { email?: unknown }).email ?? '')
    if (!email) return doc

    const start = new Date(String(current.start))
    const end = new Date(String(current.end))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return doc

    await sendBookingOutcome({
      payload: req.payload,
      to: email,
      name: String((customer as { name?: unknown }).name ?? ''),
      reference: String(current.reference ?? ''),
      outcome,
      start,
      end,
      partySize: Number(current.partySize ?? 1),
      // Captured when they booked. See the field on the Bookings collection.
      locale: current.locale === 'ar' ? 'ar' : 'en',
    })
  } catch (error) {
    await reportError(error, {
      source: 'booking.status-notification',
      extra: { booking: current.id, from, to },
    })
  }

  return doc
}

/**
 * Writes to whoever manages the listing.
 *
 * Everything is read with access overridden, because the hook runs as whoever
 * made the change - a customer, who may read neither the business-users
 * collection nor anybody else's record. The ordinary path would find nothing and
 * the venue would simply never hear.
 *
 * A listing with no partner account attached is silent rather than an error.
 * Most listings have none: they were onboarded by us and their bookings are
 * answered from the admin, which is a perfectly good arrangement and not a
 * failure to report.
 */
async function notifyVenue(booking: BookingDoc, from: BookingStatus, req: PayloadRequest) {
  const businessId = idOf(booking.business)
  if (businessId === null) return

  const owners = await req.payload.find({
    collection: 'business-users',
    where: { businesses: { in: [businessId] } },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })

  if (owners.docs.length === 0) return

  const business = await req.payload
    .findByID({ collection: 'businesses', id: businessId, depth: 0, overrideAccess: true })
    .catch(() => null)

  const customerId = idOf(booking.customer)
  const customer =
    customerId === null
      ? null
      : await req.payload
          .findByID({ collection: 'customers', id: customerId, depth: 0, overrideAccess: true })
          .catch(() => null)

  const start = new Date(String(booking.start))
  if (Number.isNaN(start.getTime())) return

  for (const owner of owners.docs) {
    const to = String((owner as { email?: unknown }).email ?? '')
    if (!to) continue

    await sendVenueCancellation({
      payload: req.payload,
      to,
      businessName: String((business as { name?: unknown } | null)?.name ?? 'your listing'),
      guestName: String((customer as { name?: unknown } | null)?.name ?? ''),
      reference: String(booking.reference ?? ''),
      start,
      partySize: Number(booking.partySize ?? 1),
      // A confirmed booking freed a table. A pending one was only a request.
      wasConfirmed: from === 'confirmed',
    })
  }
}
