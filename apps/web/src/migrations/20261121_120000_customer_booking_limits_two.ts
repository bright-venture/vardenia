import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Two booking limits per customer instead of one (21 November 2026,
 * authentication audit; decided by the owner).
 *
 * Before: a sixth upcoming booking (pending or confirmed) was refused, which
 * stopped a real traveller planning a week. Now, for a new pending booking:
 * refused when the customer already has 5 requests waiting for an answer, or 15
 * upcoming bookings in total. lib/booking-service applies the same two numbers
 * before inserting; this is the database's copy, for requests that race past
 * that count.
 *
 * Only the function changes: the trigger (BEFORE INSERT, from migration
 * 20261013_120000_customer_booking_limit) still calls it, and still checks only
 * new pending bookings, as before. The messages are matched in
 * lib/booking-service (translateInsertError).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "payload".enforce_customer_booking_limit()
    RETURNS TRIGGER AS $$
    DECLARE
      closed timestamptz;
      waiting integer;
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

      SELECT
        count(*) FILTER (WHERE x.status = 'pending'),
        count(*)
      INTO waiting, upcoming
      FROM "payload"."bookings" x
      WHERE x.customer_id = NEW.customer_id
        AND x.status IN ('pending', 'confirmed')
        AND x."start" > now();

      IF upcoming >= 15 THEN
        RAISE EXCEPTION 'This account already has the most upcoming bookings allowed.'
          USING ERRCODE = 'check_violation';
      END IF;

      IF waiting >= 5 THEN
        RAISE EXCEPTION 'This account already has the most booking requests waiting for an answer.'
          USING ERRCODE = 'check_violation';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)
}

/** Back to one limit: a sixth upcoming booking refused. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
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
}
