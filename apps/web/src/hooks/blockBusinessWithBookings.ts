import type { CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'

/**
 * Stops a listing being deleted while somebody's booking still points at it.
 *
 * The third and last table with the contradiction blockMediaInUse describes.
 * `bookings.business` is required, so the column is `not null`, while Payload
 * declares the foreign key `on delete set null`: Postgres tries to null a column
 * that cannot be null, the delete fails, and the admin panel says "An unknown
 * error has occurred" without mentioning that the listing has bookings.
 *
 * Found by asking the database for every column in that state rather than by
 * hitting it again:
 *
 *     bookings.business_id  -> businesses
 *     bookings.customer_id  -> customers    (closeRatherThanDelete)
 *     issues.cover_id       -> media        (blockMediaInUse)
 *
 * The other two were already handled. This one was not.
 *
 * # Refusing is the right answer, not deleting the bookings too
 *
 * A booking is the venue's record as much as the reader's - the same reasoning
 * that makes a closed customer account a tombstone instead of a deleted row. A
 * listing that took real bookings should not be removable in one click, and
 * anybody who genuinely means it can delete the bookings first.
 *
 * Teardown already does exactly that: clearListings deletes scan events, codes
 * and bookings before the listing, so the count here is zero and nothing needs
 * an exemption.
 */
export const blockBusinessWithBookings: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const result = await req.payload.find({
    collection: 'bookings',
    where: { business: { equals: id } },
    limit: 3,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (result.totalDocs === 0) return

  /**
   * Named by reference and date, because "3 bookings" is not enough to act on.
   * Somebody deciding whether to delete a listing needs to know whether those
   * bookings are last year's or next week's.
   */
  const examples = result.docs.map((doc) => {
    // `start` is top level despite sitting in a `row` in the admin form: a row
    // is a layout container and contributes nothing to the stored shape.
    const booking = doc as { reference?: string | null; start?: string | null; id?: unknown }
    const when = typeof booking.start === 'string' ? booking.start.slice(0, 10) : 'no date'
    return `${booking.reference ?? `#${booking.id}`} (${when})`
  })

  const more = result.totalDocs - result.docs.length
  const listed = more > 0 ? `${examples.join(', ')} and ${more} more` : examples.join(', ')

  throw new APIError(
    `This listing cannot be deleted: ${result.totalDocs} booking${result.totalDocs === 1 ? '' : 's'} ` +
      `still ${result.totalDocs === 1 ? 'points' : 'point'} at it - ${listed}. ` +
      "A booking is the venue's record too, so delete those first if you really mean to remove the listing.",
    400,
  )
}
