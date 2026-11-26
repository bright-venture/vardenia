import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Hotel room types (17 November 2026).
 *
 * Only additions: new tables for room types (with their translations, photos,
 * views, amenities and options), room lines on bookings, check-in and check-out
 * times on the booking rules, and `bookings.room_count`. No existing row is
 * changed, so restaurants and every booking made before this book as they did.
 *
 * Hand-added after the generated part:
 *
 * - Row level security on the new tables, like every other table here (see
 *   20260928_090000_restore_row_level_security).
 * - The indexes asked for on 17 November: partial indexes for breakfast and free
 *   cancellation options, and a GiST index on the time range of occupying
 *   bookings, which the "which bookings overlap these nights" lookups use as
 *   bookings grow.
 * - The room guarantee. Like the listing-capacity trigger
 *   (20260818_181600_booking_capacity_trigger), a check in the database, under
 *   an advisory lock per room type, so two guests taking the last room at the
 *   same moment cannot both get it. For every night of the stay, the rooms of a
 *   type held by other occupying bookings plus this booking's must not pass the
 *   type's number of rooms. The listing-capacity trigger now skips a booking
 *   with rooms (room_count > 0), which is counted here instead.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_room_types_views" AS ENUM('sea', 'mountain', 'city', 'garden', 'pool');
  CREATE TYPE "payload"."enum_room_types_amenities" AS ENUM('private-bathroom', 'balcony', 'kitchenette', 'air-conditioning', 'heating', 'wifi', 'tv', 'minibar', 'coffee-machine', 'bathtub', 'work-desk', 'safe', 'soundproofing', 'fireplace');
  CREATE TYPE "payload"."enum_room_types_options_cancellation" AS ENUM('free', 'non-refundable');
  CREATE TYPE "payload"."enum_room_types_options_payment" AS ENUM('at-property', 'in-advance');
  CREATE TYPE "payload"."enum_room_types_kind" AS ENUM('room', 'suite');
  CREATE TABLE "payload"."bookings_rooms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"room_type_id" integer,
  	"count" numeric DEFAULT 1,
  	"room_name" varchar,
  	"option_id" varchar,
  	"option_label" varchar
  );
  
  CREATE TABLE "payload"."room_types_views" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_room_types_views",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."room_types_amenities" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_room_types_amenities",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."room_types_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"breakfast" boolean,
  	"cancellation" "payload"."enum_room_types_options_cancellation" DEFAULT 'free' NOT NULL,
  	"free_cancellation_days" numeric DEFAULT 1,
  	"payment" "payload"."enum_room_types_options_payment" DEFAULT 'at-property' NOT NULL,
  	"price" numeric
  );
  
  CREATE TABLE "payload"."room_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" integer NOT NULL,
  	"kind" "payload"."enum_room_types_kind" DEFAULT 'room' NOT NULL,
  	"rooms" numeric DEFAULT 1 NOT NULL,
  	"sleeps_adults" numeric DEFAULT 2 NOT NULL,
  	"sleeps_children" numeric DEFAULT 0,
  	"size_m2" numeric,
  	"active" boolean DEFAULT true,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."room_types_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"beds" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."room_types_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_check_in_time" varchar DEFAULT '15:00';
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_check_out_time" varchar DEFAULT '11:00';
  ALTER TABLE "payload"."bookings" ADD COLUMN "room_count" numeric DEFAULT 0;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "room_types_id" integer;
  ALTER TABLE "payload"."bookings_rooms" ADD CONSTRAINT "bookings_rooms_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "payload"."room_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."bookings_rooms" ADD CONSTRAINT "bookings_rooms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."room_types_views" ADD CONSTRAINT "room_types_views_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."room_types_amenities" ADD CONSTRAINT "room_types_amenities_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."room_types_options" ADD CONSTRAINT "room_types_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."room_types" ADD CONSTRAINT "room_types_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."room_types_locales" ADD CONSTRAINT "room_types_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."room_types_rels" ADD CONSTRAINT "room_types_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."room_types_rels" ADD CONSTRAINT "room_types_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "bookings_rooms_order_idx" ON "payload"."bookings_rooms" USING btree ("_order");
  CREATE INDEX "bookings_rooms_parent_id_idx" ON "payload"."bookings_rooms" USING btree ("_parent_id");
  CREATE INDEX "bookings_rooms_room_type_idx" ON "payload"."bookings_rooms" USING btree ("room_type_id");
  CREATE INDEX "room_types_views_order_idx" ON "payload"."room_types_views" USING btree ("order");
  CREATE INDEX "room_types_views_parent_idx" ON "payload"."room_types_views" USING btree ("parent_id");
  CREATE INDEX "room_types_views_value_idx" ON "payload"."room_types_views" USING btree ("value");
  CREATE INDEX "room_types_amenities_order_idx" ON "payload"."room_types_amenities" USING btree ("order");
  CREATE INDEX "room_types_amenities_parent_idx" ON "payload"."room_types_amenities" USING btree ("parent_id");
  CREATE INDEX "room_types_amenities_value_idx" ON "payload"."room_types_amenities" USING btree ("value");
  CREATE INDEX "room_types_options_order_idx" ON "payload"."room_types_options" USING btree ("_order");
  CREATE INDEX "room_types_options_parent_id_idx" ON "payload"."room_types_options" USING btree ("_parent_id");
  CREATE INDEX "room_types_options_breakfast_idx" ON "payload"."room_types_options" USING btree ("breakfast");
  CREATE INDEX "room_types_options_cancellation_idx" ON "payload"."room_types_options" USING btree ("cancellation");
  CREATE INDEX "room_types_business_idx" ON "payload"."room_types" USING btree ("business_id");
  CREATE INDEX "room_types_active_idx" ON "payload"."room_types" USING btree ("active");
  CREATE INDEX "room_types_updated_at_idx" ON "payload"."room_types" USING btree ("updated_at");
  CREATE INDEX "room_types_created_at_idx" ON "payload"."room_types" USING btree ("created_at");
  CREATE INDEX "business_active_idx" ON "payload"."room_types" USING btree ("business_id","active");
  CREATE UNIQUE INDEX "room_types_locales_locale_parent_id_unique" ON "payload"."room_types_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "room_types_rels_order_idx" ON "payload"."room_types_rels" USING btree ("order");
  CREATE INDEX "room_types_rels_parent_idx" ON "payload"."room_types_rels" USING btree ("parent_id");
  CREATE INDEX "room_types_rels_path_idx" ON "payload"."room_types_rels" USING btree ("path");
  CREATE INDEX "room_types_rels_media_id_idx" ON "payload"."room_types_rels" USING btree ("media_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_room_types_fk" FOREIGN KEY ("room_types_id") REFERENCES "payload"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_room_types_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("room_types_id");`)

  await db.execute(sql`
  ALTER TABLE "payload"."room_types" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_locales" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_rels" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_views" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_amenities" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_options" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."bookings_rooms" ENABLE ROW LEVEL SECURITY;

  CREATE INDEX IF NOT EXISTS "room_types_options_breakfast_true_idx"
    ON "payload"."room_types_options" ("_parent_id") WHERE "breakfast";
  CREATE INDEX IF NOT EXISTS "room_types_options_free_cancel_idx"
    ON "payload"."room_types_options" ("_parent_id") WHERE "cancellation" = 'free';
  CREATE INDEX IF NOT EXISTS "bookings_occupying_range_idx"
    ON "payload"."bookings" USING gist (tstzrange("start", "end"))
    WHERE "status" IN ('pending', 'confirmed');
  CREATE INDEX IF NOT EXISTS "bookings_room_count_idx"
    ON "payload"."bookings" ("business_id") WHERE "room_count" > 0;`)

  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "payload".enforce_booking_capacity()
    RETURNS TRIGGER AS $$
    DECLARE
      allowed integer;
      taken integer;
    BEGIN
      IF NEW.status NOT IN ('pending', 'confirmed') THEN
        RETURN NEW;
      END IF;

      -- A hotel booking with rooms is counted against its room types instead.
      IF COALESCE(NEW.room_count, 0) > 0 THEN
        RETURN NEW;
      END IF;

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
        AND COALESCE(x.room_count, 0) = 0
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

  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "payload".enforce_room_inventory_for(booking integer)
    RETURNS void AS $$
    DECLARE
      b record;
      line record;
      night date;
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

      -- The Beirut nights held: arrival day up to the night before departure.
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

        SELECT COALESCE(t.rooms, 0)::integer INTO allowed
        FROM "payload"."room_types" t WHERE t.id = line.room_type_id;

        FOR night IN
          SELECT d::date FROM generate_series(first_night, last_night, interval '1 day') AS d
        LOOP
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

    CREATE OR REPLACE FUNCTION "payload".enforce_room_inventory_line()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM "payload".enforce_room_inventory_for(NEW._parent_id);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION "payload".enforce_room_inventory_booking()
    RETURNS TRIGGER AS $$
    BEGIN
      IF COALESCE(NEW.room_count, 0) > 0 THEN
        PERFORM "payload".enforce_room_inventory_for(NEW.id);
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS enforce_room_inventory_line ON "payload"."bookings_rooms";
    CREATE TRIGGER enforce_room_inventory_line
      AFTER INSERT OR UPDATE OF room_type_id, "count"
      ON "payload"."bookings_rooms"
      FOR EACH ROW
      EXECUTE FUNCTION "payload".enforce_room_inventory_line();

    DROP TRIGGER IF EXISTS enforce_room_inventory_booking ON "payload"."bookings";
    CREATE TRIGGER enforce_room_inventory_booking
      AFTER UPDATE OF "start", "end", status
      ON "payload"."bookings"
      FOR EACH ROW
      EXECUTE FUNCTION "payload".enforce_room_inventory_booking();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS enforce_room_inventory_booking ON "payload"."bookings";
    DROP TRIGGER IF EXISTS enforce_room_inventory_line ON "payload"."bookings_rooms";
    DROP FUNCTION IF EXISTS "payload".enforce_room_inventory_booking();
    DROP FUNCTION IF EXISTS "payload".enforce_room_inventory_line();
    DROP FUNCTION IF EXISTS "payload".enforce_room_inventory_for(integer);
    DROP INDEX IF EXISTS "payload"."bookings_occupying_range_idx";
    DROP INDEX IF EXISTS "payload"."bookings_room_count_idx";
  `)
  // The listing-capacity check as it was, before room_count is dropped below.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "payload".enforce_booking_capacity()
    RETURNS TRIGGER AS $$
    DECLARE
      allowed integer;
      taken integer;
    BEGIN
      IF NEW.status NOT IN ('pending', 'confirmed') THEN
        RETURN NEW;
      END IF;
      PERFORM pg_advisory_xact_lock(hashtext('vardenia.booking:' || NEW.business_id::text));
      SELECT COALESCE(b.booking_capacity, 1) INTO allowed
      FROM "payload"."businesses" b WHERE b.id = NEW.business_id;
      IF allowed IS NULL THEN
        allowed := 1;
      END IF;
      SELECT count(*) INTO taken
      FROM "payload"."bookings" x
      WHERE x.business_id = NEW.business_id
        AND x.id IS DISTINCT FROM NEW.id
        AND x.status IN ('pending', 'confirmed')
        AND x."start" < NEW."end"
        AND x."end" > NEW."start";
      IF taken >= allowed THEN
        RAISE EXCEPTION 'This place is fully booked at that time.' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)
  await db.execute(sql`
   ALTER TABLE "payload"."bookings_rooms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_views" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_amenities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."room_types_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."bookings_rooms" CASCADE;
  DROP TABLE "payload"."room_types_views" CASCADE;
  DROP TABLE "payload"."room_types_amenities" CASCADE;
  DROP TABLE "payload"."room_types_options" CASCADE;
  DROP TABLE "payload"."room_types" CASCADE;
  DROP TABLE "payload"."room_types_locales" CASCADE;
  DROP TABLE "payload"."room_types_rels" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_room_types_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_room_types_id_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_check_in_time";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_check_out_time";
  ALTER TABLE "payload"."bookings" DROP COLUMN "room_count";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "room_types_id";
  DROP TYPE "payload"."enum_room_types_views";
  DROP TYPE "payload"."enum_room_types_amenities";
  DROP TYPE "payload"."enum_room_types_options_cancellation";
  DROP TYPE "payload"."enum_room_types_options_payment";
  DROP TYPE "payload"."enum_room_types_kind";`)
}
