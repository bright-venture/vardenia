import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A guest's booking limit, held by the database rather than by a count in the
 * application, the same way enforce_booking_capacity holds a venue's.
 *
 * createBooking counts a customer's upcoming bookings and refuses a sixth. But
 * count-then-insert is a race: five requests sent at once all count four, and
 * all five go in - so one account could take a venue's whole future capacity.
 * And a request already past the session check could still land while the
 * account was being closed, leaving a live reservation on a closed account.
 *
 * Before a new pending booking is inserted, this locks the customer's row until
 * the insert commits. Requests from one account then queue instead of racing,
 * and closing the account - which updates that row - waits for them or they wait
 * for it. Once the row is locked: a closed account is refused, and so is a sixth
 * upcoming booking, by the same rule as pendingBookingCount (pending or
 * confirmed, starting in the future).
 *
 * Only a new booking with status pending, which is what the guest booking flow
 * inserts. A booking staff create already confirmed, after a phone call, is
 * theirs to judge. The messages are matched in translateInsertError.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "payload".enforce_customer_booking_limit()
    RETURNS TRIGGER AS $$
    DECLARE
      closed timestamptz;
      upcoming integer;
    BEGIN
      IF NEW.customer_id IS NULL OR NEW.status IS DISTINCT FROM 'pending' THEN
        RETURN NEW;
      END IF;

      -- Held until commit. Serialises this customer's bookings and their closure.
      SELECT c.deleted_at INTO closed
      FROM "payload"."customers" c
      WHERE c.id = NEW.customer_id
      FOR UPDATE;

      IF closed IS NOT NULL THEN
        RAISE EXCEPTION 'This account has been closed.'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT count(*) INTO upcoming
      FROM "payload"."bookings" x
      WHERE x.customer_id = NEW.customer_id
        AND x.status IN ('pending', 'confirmed')
        AND x."start" > now();

      IF upcoming >= 5 THEN
        RAISE EXCEPTION 'This account already has the most upcoming bookings allowed.'
          USING ERRCODE = 'check_violation';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  await db.execute(sql`
    DROP TRIGGER IF EXISTS enforce_customer_booking_limit ON "payload"."bookings";
    CREATE TRIGGER enforce_customer_booking_limit
      BEFORE INSERT ON "payload"."bookings"
      FOR EACH ROW EXECUTE FUNCTION "payload".enforce_customer_booking_limit();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS enforce_customer_booking_limit ON "payload"."bookings";
    DROP FUNCTION IF EXISTS "payload".enforce_customer_booking_limit();
  `)
}
