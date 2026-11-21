import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'
import { transactionDb } from './transaction-db'

/**
 * The listing's booking lock, taken by the application (Task 8, 20 November
 * 2026).
 *
 * The same key the capacity trigger takes (`vardenia.booking:<business id>`,
 * see migrations/20260818_181600_booking_capacity_trigger and the Task 8
 * trigger in migrations-sql/seating-capacity-trigger.sql), as a
 * transaction-scoped advisory lock on the connection of the save's own
 * transaction (lib/transaction-db; Payload opens the transaction before
 * `beforeValidate`). Held until that save commits or rolls back.
 *
 * Two uses:
 *  - hooks/guardBookingWrite takes it before counting the bookings of a
 *    seating area, so two requests for the last table in an area queue: the
 *    second counts after the first has committed and is refused. This makes
 *    the application check itself race-safe for area bookings, whatever
 *    trigger is installed. When the trigger takes the same lock in the same
 *    transaction it is re-entrant (advisory locks stack per session).
 *  - hooks/protectSeatingAreaBookings takes it before checking that a change
 *    to a listing's areas strands no upcoming booking, so a booking cannot be
 *    inserted into an area between that check and the commit that removes it.
 *
 * No timeout, like the trigger's own wait: the work under it is a count and an
 * insert. Outside a transaction it falls back to the pool and protects only its
 * own statement (the documented lib/transaction-db fallback); no database in
 * reach, it does nothing.
 */
export async function lockBookingSlots(
  req: PayloadRequest,
  businessId: string | number,
): Promise<void> {
  const db = await transactionDb(req)
  if (!db) return
  const key = `vardenia.booking:${String(businessId)}`
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)
}
