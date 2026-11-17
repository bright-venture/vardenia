import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Open dates for room types (17 November 2026).
 *
 * Adds `room_availability`: the nights a room type is open and how many of its
 * rooms are sold on them, set by the hotel, like the "Rooms to sell" row of
 * Booking.com's extranet calendar. A room type is closed on every night no
 * period covers (decided 17 November 2026), and the last-saved period wins
 * where two overlap.
 *
 * The room guarantee from 20261117_115415_room_types now reads each night's
 * rooms from these periods instead of the room type's total. Only additions
 * and that function; no existing row changes. Production has no room types
 * yet, so nothing that was bookable becomes closed there.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."room_availability" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"room_type_id" integer NOT NULL,
  	"business_id" integer,
  	"starts_on" varchar NOT NULL,
  	"ends_on" varchar NOT NULL,
  	"rooms" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "room_availability_id" integer;
  ALTER TABLE "payload"."room_availability" ADD CONSTRAINT "room_availability_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "payload"."room_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."room_availability" ADD CONSTRAINT "room_availability_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "room_availability_room_type_idx" ON "payload"."room_availability" USING btree ("room_type_id");
  CREATE INDEX "room_availability_business_idx" ON "payload"."room_availability" USING btree ("business_id");
  CREATE INDEX "room_availability_starts_on_idx" ON "payload"."room_availability" USING btree ("starts_on");
  CREATE INDEX "room_availability_ends_on_idx" ON "payload"."room_availability" USING btree ("ends_on");
  CREATE INDEX "room_availability_updated_at_idx" ON "payload"."room_availability" USING btree ("updated_at");
  CREATE INDEX "room_availability_created_at_idx" ON "payload"."room_availability" USING btree ("created_at");
  CREATE INDEX "roomType_startsOn_endsOn_idx" ON "payload"."room_availability" USING btree ("room_type_id","starts_on","ends_on");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_room_availability_fk" FOREIGN KEY ("room_availability_id") REFERENCES "payload"."room_availability"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_room_availability_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("room_availability_id");`)

  await db.execute(sql`
    ALTER TABLE "payload"."room_availability" ENABLE ROW LEVEL SECURITY;
  `)
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "payload".enforce_room_inventory_for(booking integer)
    RETURNS void AS $$
    DECLARE
      b record;
      line record;
      night date;
      total integer;
      allowed integer;
      taken integer;
      first_night date;
      last_night date;
    BEGIN
      SELECT x.id, x."start", x."end", x.status INTO b
      FROM "payload"."bookings" x WHERE x.id = booking;
      IF NOT FOUND OR b.status NOT IN ('pending', 'confirmed') THEN
        RETURN;
      END IF;

      first_night := (b."start" AT TIME ZONE 'Asia/Beirut')::date;
      last_night := GREATEST((b."end" AT TIME ZONE 'Asia/Beirut')::date - 1, first_night);

      FOR line IN
        SELECT r.room_type_id, sum(r."count")::integer AS wanted
        FROM "payload"."bookings_rooms" r
        WHERE r._parent_id = booking AND r.room_type_id IS NOT NULL
        GROUP BY r.room_type_id
        ORDER BY r.room_type_id
      LOOP
        PERFORM pg_advisory_xact_lock(hashtext('vardenia.room-type:' || line.room_type_id::text));

        SELECT COALESCE(t.rooms, 0)::integer INTO total
        FROM "payload"."room_types" t WHERE t.id = line.room_type_id;

        FOR night IN
          SELECT d::date FROM generate_series(first_night, last_night, interval '1 day') AS d
        LOOP
          -- Rooms sold that night: the last-saved open period covering it, never
          -- more than the room type has; none covering it means closed.
          SELECT LEAST(COALESCE(a.rooms, 0)::integer, COALESCE(total, 0)) INTO allowed
          FROM "payload"."room_availability" a
          WHERE a.room_type_id = line.room_type_id
            AND a.starts_on <= to_char(night, 'YYYY-MM-DD')
            AND a.ends_on >= to_char(night, 'YYYY-MM-DD')
          ORDER BY a.id DESC
          LIMIT 1;
          IF NOT FOUND THEN
            allowed := 0;
          END IF;

          SELECT COALESCE(sum(r."count"), 0)::integer INTO taken
          FROM "payload"."bookings_rooms" r
          JOIN "payload"."bookings" x ON x.id = r._parent_id
          WHERE r.room_type_id = line.room_type_id
            AND x.id <> booking
            AND x.status IN ('pending', 'confirmed')
            AND (x."start" AT TIME ZONE 'Asia/Beirut')::date <= night
            AND GREATEST(
                  (x."end" AT TIME ZONE 'Asia/Beirut')::date,
                  (x."start" AT TIME ZONE 'Asia/Beirut')::date + 1
                ) > night;

          IF taken + line.wanted > COALESCE(allowed, 0) THEN
            RAISE EXCEPTION
              'There are not enough rooms of that type left for those dates.'
              USING ERRCODE = 'check_violation';
          END IF;
        END LOOP;
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The room guarantee as it was: every night sells the room type's total.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "payload".enforce_room_inventory_for(booking integer)
    RETURNS void AS $$
    DECLARE
      b record;
      line record;
      night date;
      total integer;
      allowed integer;
      taken integer;
      first_night date;
      last_night date;
    BEGIN
      SELECT x.id, x."start", x."end", x.status INTO b
      FROM "payload"."bookings" x WHERE x.id = booking;
      IF NOT FOUND OR b.status NOT IN ('pending', 'confirmed') THEN
        RETURN;
      END IF;

      first_night := (b."start" AT TIME ZONE 'Asia/Beirut')::date;
      last_night := GREATEST((b."end" AT TIME ZONE 'Asia/Beirut')::date - 1, first_night);

      FOR line IN
        SELECT r.room_type_id, sum(r."count")::integer AS wanted
        FROM "payload"."bookings_rooms" r
        WHERE r._parent_id = booking AND r.room_type_id IS NOT NULL
        GROUP BY r.room_type_id
        ORDER BY r.room_type_id
      LOOP
        PERFORM pg_advisory_xact_lock(hashtext('vardenia.room-type:' || line.room_type_id::text));

        SELECT COALESCE(t.rooms, 0)::integer INTO total
        FROM "payload"."room_types" t WHERE t.id = line.room_type_id;

        FOR night IN
          SELECT d::date FROM generate_series(first_night, last_night, interval '1 day') AS d
        LOOP
          allowed := COALESCE(total, 0);

          SELECT COALESCE(sum(r."count"), 0)::integer INTO taken
          FROM "payload"."bookings_rooms" r
          JOIN "payload"."bookings" x ON x.id = r._parent_id
          WHERE r.room_type_id = line.room_type_id
            AND x.id <> booking
            AND x.status IN ('pending', 'confirmed')
            AND (x."start" AT TIME ZONE 'Asia/Beirut')::date <= night
            AND GREATEST(
                  (x."end" AT TIME ZONE 'Asia/Beirut')::date,
                  (x."start" AT TIME ZONE 'Asia/Beirut')::date + 1
                ) > night;

          IF taken + line.wanted > COALESCE(allowed, 0) THEN
            RAISE EXCEPTION
              'There are not enough rooms of that type left for those dates.'
              USING ERRCODE = 'check_violation';
          END IF;
        END LOOP;
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  `)
  await db.execute(sql`
   ALTER TABLE "payload"."room_availability" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."room_availability" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_room_availability_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_room_availability_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "room_availability_id";`)
}
