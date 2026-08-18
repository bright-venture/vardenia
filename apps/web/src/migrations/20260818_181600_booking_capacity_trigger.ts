import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The capacity guarantee, in the only place it can actually be made.
 *
 * # Why this is not in application code
 *
 * `hooks/guardBookingWrite` checks capacity before every insert, and that check
 * is worth having - it produces "fully booked at that time" instead of a
 * constraint violation. It cannot be the guarantee. Two people booking the last
 * table at the same instant both read "one taken, capacity two", both pass, and
 * both write. The check and the insert are separate statements, and no amount of
 * care between them closes a gap that exists because they are separate.
 *
 * The usual fix is to hold a lock across both. That is not available here:
 * `src/lib/db.ts` exposes Payload's connection *pool*, not the connection its
 * write is running on, so `pg_advisory_xact_lock` taken through it would sit in
 * a different transaction and release immediately - a lock that looks like one
 * and protects nothing.
 *
 * A trigger runs inside the inserting transaction. `pg_advisory_xact_lock` here
 * is held for exactly the right span and released by the commit, so two
 * concurrent inserts for the same business serialise: the second waits, then
 * counts, and sees the first. The lock is keyed on the business, so bookings at
 * different listings never contend.
 *
 * It also cannot be bypassed. The admin panel, the REST API, a seed script and
 * somebody typing INSERT into the SQL editor all go through it, which is not
 * true of anything written in TypeScript.
 *
 * # Reading the rules
 *
 * Capacity lives on the listing, in `businesses.booking_capacity`. Payload
 * flattens a group field to `<group>_<field>`, so the column name follows from
 * the field being called `capacity` inside a group called `booking`. If that
 * group is ever renamed this trigger stops matching - hence the guard below,
 * which fails the migration loudly rather than installing something that
 * silently permits everything.
 *
 * A NULL or absent capacity means one, matching `resolveRules` in
 * lib/availability. The two defaults have to agree or the engine and the
 * database disagree about what a half-configured listing allows.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Fail loudly now rather than permitting everything later.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'payload'
          AND table_name = 'businesses'
          AND column_name = 'booking_capacity'
      ) THEN
        RAISE EXCEPTION
          'payload.businesses.booking_capacity is missing - the booking rules group was renamed, and the capacity trigger would silently allow unlimited bookings';
      END IF;
    END $$;
  `)

  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "payload".enforce_booking_capacity()
    RETURNS TRIGGER AS $$
    DECLARE
      allowed integer;
      taken integer;
    BEGIN
      -- Cancelled, completed and no-show bookings release their place, so a
      -- change into one of those can never breach capacity and needs no lock.
      IF NEW.status NOT IN ('pending', 'confirmed') THEN
        RETURN NEW;
      END IF;

      -- Serialises concurrent writes for this business only. Held until commit.
      PERFORM pg_advisory_xact_lock(hashtext('vardenia.booking:' || NEW.business_id::text));

      SELECT COALESCE(b.booking_capacity, 1) INTO allowed
      FROM "payload"."businesses" b
      WHERE b.id = NEW.business_id;

      IF allowed IS NULL THEN
        allowed := 1;
      END IF;

      SELECT count(*) INTO taken
      FROM "payload"."bookings" x
      WHERE x.business_id = NEW.business_id
        AND x.id IS DISTINCT FROM NEW.id
        AND x.status IN ('pending', 'confirmed')
        -- Half-open overlap, matching overlaps() in packages/core/src/booking.ts.
        -- Strict on both sides, so a booking ending exactly when another starts
        -- is not a conflict.
        AND x."start" < NEW."end"
        AND x."end" > NEW."start";

      IF taken >= allowed THEN
        RAISE EXCEPTION
          'This place is fully booked at that time.'
          USING ERRCODE = 'check_violation';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  /**
   * Fires on UPDATE as well as INSERT.
   *
   * Moving an existing booking's times, or reviving one into an occupying
   * status, can breach capacity exactly as a new row can. `x.id IS DISTINCT
   * FROM NEW.id` above is what stops a booking conflicting with itself when it
   * is merely being edited.
   */
  await db.execute(sql`
    DROP TRIGGER IF EXISTS enforce_booking_capacity ON "payload"."bookings";
    CREATE TRIGGER enforce_booking_capacity
      BEFORE INSERT OR UPDATE OF "start", "end", status, business_id
      ON "payload"."bookings"
      FOR EACH ROW
      EXECUTE FUNCTION "payload".enforce_booking_capacity();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS enforce_booking_capacity ON "payload"."bookings";
    DROP FUNCTION IF EXISTS "payload".enforce_booking_capacity();
  `)
}
