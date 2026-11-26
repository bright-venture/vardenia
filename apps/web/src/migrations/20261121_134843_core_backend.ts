import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Core backend (plan 2026-11-20-core-backend, Tasks 1-10): one migration for
 * every schema change of that plan.
 *
 *  - Tiers: 'platinum' after 'gold' (ADD VALUE, never a recreate: the directory
 *    sorts on -tier, which is declaration order). Settings gold_places goes;
 *    max_gold_per_category and max_platinum arrive with no database default:
 *    NULL means 6 (lib/tier-limits), and the config has no defaultValue, so a
 *    database default here would only make the next generated migration drop it.
 *  - Contact group (contact_*), map_url; the submission form's website and
 *    public phone columns are dropped (contact_phone is a new column, not a
 *    rename: the old values are not copied, contact is publicly readable).
 *  - Media: uploaded_by_id (ON DELETE SET NULL) and attached (DEFAULT false).
 *    Every existing row gets uploaded_by_id NULL, which the public media read
 *    rule (access/index mediaRead, uploadedBy exists: false) still shows.
 *  - Hotel facilities and the new room view and amenity values; guest house
 *    stay, packages and features; booking price snapshot; restaurant seating
 *    areas and booking area; brands.
 *
 * The drops and the adds were generated in two steps (previous snapshot ->
 * snapshot without the three dropped columns -> current schema), so drizzle-kit
 * never had to ask whether gold_places or the submission columns were renamed.
 * They were not.
 *
 * The base is the snapshot of 20261120_131807_remove_place_requests_add_expired
 * (place_requests removed, submission status 'expired'), the latest one before
 * this migration; 20261121_120000_customer_booking_limits_two changes only a
 * function. Nothing below touches what those two own. This file's .json is the
 * whole current schema, theirs included.
 *
 * ADD VALUE runs inside the migration's transaction. Postgres (12 and later)
 * allows that as long as the new value is not used before commit, and nothing
 * below uses it.
 *
 * Hand-written parts, which the generator does not produce:
 *  - row level security on the ten new tables (see 20260826_140000_row_level_security);
 *  - a CHECK on seating area tables (the table is created empty just above,
 *    so it cannot fail on existing rows);
 *  - getaways get booking_capacity 1 (Task 6 ruling: one stay at a time);
 *  - the booking capacity trigger, inlined verbatim from
 *    src/migrations-sql/seating-capacity-trigger.sql (the single source; a test
 *    keeps the two identical). It runs last: its column list names
 *    bookings.area, which the generated part creates.
 * No stale seating area rows can exist (the table is new), so there is no
 * clean-up DELETE.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_public_phone";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_website";
  ALTER TABLE "payload"."settings" DROP COLUMN "gold_places";
  CREATE TYPE "payload"."enum_businesses_facilities" AS ENUM('free-wifi', 'parking-free', 'parking-paid', 'airport-shuttle', 'family-rooms', 'non-smoking-rooms', 'restaurant', 'bar', '24h-front-desk', 'room-service', 'fitness-centre', 'spa-wellness', 'outdoor-pool', 'indoor-pool', 'pets-allowed', 'accessible', 'breakfast', 'terrace', 'garden', 'beachfront', 'ev-charging', 'laundry', 'business-centre', 'meeting-rooms', 'kids-club', 'babysitting', 'currency-exchange', 'luggage-storage', 'concierge', 'bbq', 'elevator', 'heating', 'air-conditioning-public');
  CREATE TYPE "payload"."enum_businesses_popular_facilities" AS ENUM('free-wifi', 'parking-free', 'parking-paid', 'airport-shuttle', 'family-rooms', 'non-smoking-rooms', 'restaurant', 'bar', '24h-front-desk', 'room-service', 'fitness-centre', 'spa-wellness', 'outdoor-pool', 'indoor-pool', 'pets-allowed', 'accessible', 'breakfast', 'terrace', 'garden', 'beachfront', 'ev-charging', 'laundry', 'business-centre', 'meeting-rooms', 'kids-club', 'babysitting', 'currency-exchange', 'luggage-storage', 'concierge', 'bbq', 'elevator', 'heating', 'air-conditioning-public');
  CREATE TYPE "payload"."enum_businesses_property_highlights" AS ENUM('parking', 'wellness', 'breakfast', 'pool', 'beachfront', 'mountain-view', 'city-centre', 'family-friendly', 'romantic', 'business-friendly', 'pet-friendly', 'quiet-location');
  CREATE TYPE "payload"."enum_businesses_stay_packages_unit" AS ENUM('per-night', 'per-stay', 'per-person-per-night');
  CREATE TYPE "payload"."enum_businesses_seating_areas_setting" AS ENUM('indoor', 'outdoor');
  CREATE TYPE "payload"."enum_bookings_area" AS ENUM('indoor', 'indoor-smoking', 'outdoor', 'outdoor-smoking');
  ALTER TYPE "payload"."enum_businesses_tier" ADD VALUE IF NOT EXISTS 'platinum' AFTER 'gold';
  ALTER TYPE "payload"."enum_room_types_views" ADD VALUE IF NOT EXISTS 'landmark-view';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'shared-bathroom';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'shower';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'terrace';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'kettle';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'refrigerator';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'microwave';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'seating-area';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'dining-area';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'sofa';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'wardrobe';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'hairdryer';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'free-toiletries';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'bathrobes';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'slippers';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'iron';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'extra-bed-available';
  ALTER TYPE "payload"."enum_room_types_amenities" ADD VALUE IF NOT EXISTS 'crib-available';
  CREATE TABLE "payload"."businesses_facilities" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_businesses_facilities",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "payload"."businesses_popular_facilities" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_businesses_popular_facilities",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "payload"."businesses_property_highlights" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_businesses_property_highlights",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "payload"."businesses_stay_packages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"price" numeric NOT NULL,
  	"unit" "payload"."enum_businesses_stay_packages_unit" DEFAULT 'per-stay' NOT NULL,
  	"active" boolean DEFAULT true
  );

  CREATE TABLE "payload"."businesses_stay_packages_locales" (
  	"label" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );

  CREATE TABLE "payload"."businesses_seating_areas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"setting" "payload"."enum_businesses_seating_areas_setting" NOT NULL,
  	"smoking" boolean DEFAULT false,
  	"tables" numeric NOT NULL
  );

  CREATE TABLE "payload"."businesses_seating_areas_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );

  CREATE TABLE "payload"."brands" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"logo_id" integer,
  	"published" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."brands_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );

  CREATE TABLE "payload"."bookings_price_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"amount" numeric
  );

  ALTER TABLE "payload"."businesses" ADD COLUMN "brand_id" integer;
  ALTER TABLE "payload"."businesses" ADD COLUMN "map_url" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "stay_nightly_price" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "stay_extra_guest_fee" numeric DEFAULT 0;
  ALTER TABLE "payload"."businesses" ADD COLUMN "stay_included_guests" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "stay_max_guests" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "stay_min_nights" numeric DEFAULT 1;
  ALTER TABLE "payload"."businesses" ADD COLUMN "stay_children_count_as_guests" boolean DEFAULT true;
  ALTER TABLE "payload"."businesses" ADD COLUMN "features_music_allowed" boolean;
  ALTER TABLE "payload"."businesses" ADD COLUMN "features_events_hosted" boolean;
  ALTER TABLE "payload"."businesses" ADD COLUMN "features_parties_allowed" boolean;
  ALTER TABLE "payload"."businesses" ADD COLUMN "features_garden_access" boolean;
  ALTER TABLE "payload"."businesses" ADD COLUMN "features_barbecue" boolean;
  ALTER TABLE "payload"."businesses" ADD COLUMN "features_pool" boolean;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_phone" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_whatsapp" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_email" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_instagram" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_facebook" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_tiktok" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_snapchat" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_youtube" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_x" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "contact_linkedin" varchar;
  ALTER TABLE "payload"."bookings" ADD COLUMN "area" "payload"."enum_bookings_area";
  ALTER TABLE "payload"."bookings" ADD COLUMN "price_total" numeric;
  ALTER TABLE "payload"."bookings" ADD COLUMN "price_currency" varchar;
  ALTER TABLE "payload"."bookings" ADD COLUMN "price_nights" numeric;
  ALTER TABLE "payload"."bookings" ADD COLUMN "price_quoted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."media" ADD COLUMN "uploaded_by_id" integer;
  ALTER TABLE "payload"."media" ADD COLUMN "attached" boolean DEFAULT false;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "brands_id" integer;
  ALTER TABLE "payload"."settings" ADD COLUMN "max_gold_per_category" numeric;
  ALTER TABLE "payload"."settings" ADD COLUMN "max_platinum" numeric;
  ALTER TABLE "payload"."businesses_facilities" ADD CONSTRAINT "businesses_facilities_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_popular_facilities" ADD CONSTRAINT "businesses_popular_facilities_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_property_highlights" ADD CONSTRAINT "businesses_property_highlights_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_stay_packages" ADD CONSTRAINT "businesses_stay_packages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_stay_packages_locales" ADD CONSTRAINT "businesses_stay_packages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."businesses_stay_packages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_seating_areas" ADD CONSTRAINT "businesses_seating_areas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_seating_areas_locales" ADD CONSTRAINT "businesses_seating_areas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."businesses_seating_areas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."brands" ADD CONSTRAINT "brands_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."brands_locales" ADD CONSTRAINT "brands_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."brands"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."bookings_price_lines" ADD CONSTRAINT "bookings_price_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "businesses_facilities_order_idx" ON "payload"."businesses_facilities" USING btree ("order");
  CREATE INDEX "businesses_facilities_parent_idx" ON "payload"."businesses_facilities" USING btree ("parent_id");
  CREATE INDEX "businesses_popular_facilities_order_idx" ON "payload"."businesses_popular_facilities" USING btree ("order");
  CREATE INDEX "businesses_popular_facilities_parent_idx" ON "payload"."businesses_popular_facilities" USING btree ("parent_id");
  CREATE INDEX "businesses_property_highlights_order_idx" ON "payload"."businesses_property_highlights" USING btree ("order");
  CREATE INDEX "businesses_property_highlights_parent_idx" ON "payload"."businesses_property_highlights" USING btree ("parent_id");
  CREATE INDEX "businesses_stay_packages_order_idx" ON "payload"."businesses_stay_packages" USING btree ("_order");
  CREATE INDEX "businesses_stay_packages_parent_id_idx" ON "payload"."businesses_stay_packages" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "businesses_stay_packages_locales_locale_parent_id_unique" ON "payload"."businesses_stay_packages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "businesses_seating_areas_order_idx" ON "payload"."businesses_seating_areas" USING btree ("_order");
  CREATE INDEX "businesses_seating_areas_parent_id_idx" ON "payload"."businesses_seating_areas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "businesses_seating_areas_locales_locale_parent_id_unique" ON "payload"."businesses_seating_areas_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "brands_slug_idx" ON "payload"."brands" USING btree ("slug");
  CREATE INDEX "brands_logo_idx" ON "payload"."brands" USING btree ("logo_id");
  CREATE INDEX "brands_published_idx" ON "payload"."brands" USING btree ("published");
  CREATE INDEX "brands_updated_at_idx" ON "payload"."brands" USING btree ("updated_at");
  CREATE INDEX "brands_created_at_idx" ON "payload"."brands" USING btree ("created_at");
  CREATE UNIQUE INDEX "brands_locales_locale_parent_id_unique" ON "payload"."brands_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "bookings_price_lines_order_idx" ON "payload"."bookings_price_lines" USING btree ("_order");
  CREATE INDEX "bookings_price_lines_parent_id_idx" ON "payload"."bookings_price_lines" USING btree ("_parent_id");
  ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "payload"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."media" ADD CONSTRAINT "media_uploaded_by_id_business_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "payload"."business_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_brands_fk" FOREIGN KEY ("brands_id") REFERENCES "payload"."brands"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "businesses_brand_idx" ON "payload"."businesses" USING btree ("brand_id");
  CREATE INDEX "media_uploaded_by_idx" ON "payload"."media" USING btree ("uploaded_by_id");
  CREATE INDEX "media_attached_idx" ON "payload"."media" USING btree ("attached");
  CREATE INDEX "payload_locked_documents_rels_brands_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("brands_id");`)

  await db.execute(sql`
  -- Tables created by a later migration arrive without row level security
  -- (see 20260826_140000_row_level_security); the generator does not write this.
  ALTER TABLE "payload"."businesses_facilities" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."businesses_popular_facilities" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."businesses_property_highlights" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."businesses_stay_packages" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."businesses_stay_packages_locales" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."businesses_seating_areas" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."businesses_seating_areas_locales" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."brands" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."brands_locales" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."bookings_price_lines" ENABLE ROW LEVEL SECURITY;

  -- Whole tables, 1 or more. The app refuses anything else on save
  -- (fields/seatingAreas, hooks/guardKindFields); this covers raw SQL.
  ALTER TABLE "payload"."businesses_seating_areas"
    ADD CONSTRAINT "businesses_seating_areas_tables_check"
    CHECK ("tables" >= 1 AND "tables" = floor("tables"));`)

  // A guest house is one property: one stay at a time. The app forces this
  // whatever is stored (lib/stay-booking) and the trigger below does too; this
  // makes the stored value agree, so the admin capacity validator stops
  // refusing saves of legacy getaways stored with a capacity above 1.
  await db.execute(sql`
  UPDATE "payload"."businesses"
  SET "booking_capacity" = 1
  WHERE "booking_capacity" IS DISTINCT FROM 1
    AND "id" IN (
      SELECT "parent_id" FROM "payload"."businesses_subcategories"
      WHERE "value"::text = 'getaways'
    );`)

  // Verbatim copy of src/migrations-sql/seating-capacity-trigger.sql.
  await db.execute(sql`
-- Restaurant seating areas: per-area capacity in the database (Task 8, 20 November 2026).
--
-- For the Task 11 migration to run AFTER the generated part that creates
-- "payload"."businesses_seating_areas" and "payload"."bookings"."area" (names
-- to be confirmed against the generated SQL). Not run by anything yet.
--
-- Replaces "payload".enforce_booking_capacity() (last installed by
-- 20261117_115415_room_types) and adds "area" to the trigger's column list.
-- The rule, also as a pure function with tests: core/seating areaCapacityVerdict.
--
--  * Not occupying (cancelled, completed, no-show), or a room booking
--    (room_count > 0): not counted here, exactly as before.
--  * Same advisory lock as before, per listing: 'vardenia.booking:' || business_id.
--    Every occupying write for a listing serialises on it, whatever its area.
--    hooks/guardBookingWrite takes the same lock (lib/booking-lock) before
--    counting an area, and hooks/protectSeatingAreaBookings before changing a
--    listing's areas; in the same transaction it is re-entrant.
--  * area IS NULL:
--      - a getaway (businesses_subcategories.value = 'getaways'): capacity 1,
--        whatever booking_capacity says (Task 6 ruling).
--      - listing without seating areas: against booking_capacity (NULL = 1),
--        counting every other occupying non-room booking. Identical to the
--        trigger before Task 8.
--      - listing with seating areas: against booking_capacity, counting only
--        the other bookings without an area (bookings made before the listing
--        had areas). Area bookings never count against them, and vice versa.
--  * area IS NOT NULL: against the tables of the listing's row with that key
--    (setting || '-smoking' when smoking); none -> refused ("This seating area
--    is not offered here.", translated by lib/booking-service); otherwise
--    counting only other occupying non-room bookings of the same area.
--  * Overlap is half-open, as before: x.start < NEW.end AND x.end > NEW.start.
--
-- The refusal wording "This place is fully booked at that time." is unchanged:
-- lib/booking-service translateInsertError matches "fully booked".

CREATE OR REPLACE FUNCTION "payload".enforce_booking_capacity()
RETURNS TRIGGER AS $$
DECLARE
  allowed integer;
  taken integer;
  has_areas boolean;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  -- A hotel booking with rooms is counted against its room types instead.
  IF COALESCE(NEW.room_count, 0) > 0 THEN
    RETURN NEW;
  END IF;

  -- Serialises concurrent writes for this listing only. Held until commit.
  PERFORM pg_advisory_xact_lock(hashtext('vardenia.booking:' || NEW.business_id::text));

  IF NEW.area IS NULL THEN
    SELECT COALESCE(b.booking_capacity, 1) INTO allowed
    FROM "payload"."businesses" b
    WHERE b.id = NEW.business_id;

    IF allowed IS NULL THEN
      allowed := 1;
    END IF;

    -- A guest house (filed under 'getaways') is one property: one stay at a
    -- time, whatever booking_capacity says (Task 6 ruling; lib/stay-booking
    -- does the same in the app). Legacy getaways stored with a capacity above
    -- 1 can therefore not be double-booked by two racing requests.
    IF EXISTS (
      SELECT 1 FROM "payload"."businesses_subcategories" g
      WHERE g.parent_id = NEW.business_id
        AND g.value::text = 'getaways'
    ) THEN
      allowed := 1;
    END IF;

    has_areas := EXISTS (
      SELECT 1 FROM "payload"."businesses_seating_areas" s
      WHERE s._parent_id = NEW.business_id
    );

    SELECT count(*) INTO taken
    FROM "payload"."bookings" x
    WHERE x.business_id = NEW.business_id
      AND x.id IS DISTINCT FROM NEW.id
      AND x.status IN ('pending', 'confirmed')
      AND COALESCE(x.room_count, 0) = 0
      AND (NOT has_areas OR x.area IS NULL)
      AND x."start" < NEW."end"
      AND x."end" > NEW."start";
  ELSE
    -- min(): a duplicate key (refused on save) counts its smaller row.
    -- floor(): tables is numeric; a fractional value (refused on save, and by
    -- the optional CHECK below) never rounds up into an extra table.
    SELECT floor(min(s.tables))::integer INTO allowed
    FROM "payload"."businesses_seating_areas" s
    WHERE s._parent_id = NEW.business_id
      AND (s.setting::text || CASE WHEN s.smoking THEN '-smoking' ELSE '' END) = NEW.area::text;

    IF allowed IS NULL THEN
      RAISE EXCEPTION
        'This seating area is not offered here.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO taken
    FROM "payload"."bookings" x
    WHERE x.business_id = NEW.business_id
      AND x.id IS DISTINCT FROM NEW.id
      AND x.status IN ('pending', 'confirmed')
      AND COALESCE(x.room_count, 0) = 0
      AND x.area = NEW.area
      AND x."start" < NEW."end"
      AND x."end" > NEW."start";
  END IF;

  IF taken >= allowed THEN
    RAISE EXCEPTION
      'This place is fully booked at that time.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Moving a booking to another area is a move like changing its times.
DROP TRIGGER IF EXISTS enforce_booking_capacity ON "payload"."bookings";
CREATE TRIGGER enforce_booking_capacity
  BEFORE INSERT OR UPDATE OF "start", "end", status, business_id, area
  ON "payload"."bookings"
  FOR EACH ROW
  EXECUTE FUNCTION "payload".enforce_booking_capacity();

-- Optional, Task 11 (the app already refuses these on save):
--   ALTER TABLE "payload"."businesses_seating_areas"
--     ADD CONSTRAINT "businesses_seating_areas_tables_check"
--     CHECK ("tables" >= 1 AND "tables" = floor("tables"));

-- Down (restores the 20261117_115415_room_types version): re-run that
-- migration's CREATE OR REPLACE FUNCTION, then
--   DROP TRIGGER IF EXISTS enforce_booking_capacity ON "payload"."bookings";
--   CREATE TRIGGER enforce_booking_capacity
--     BEFORE INSERT OR UPDATE OF "start", "end", status, business_id
--     ON "payload"."bookings" FOR EACH ROW
--     EXECUTE FUNCTION "payload".enforce_booking_capacity();
`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The trigger as 20261117_115415_room_types installed it, without "area" in
  // its column list. First, because DROP COLUMN "area" below would otherwise
  // fail on the trigger that depends on it.
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

    DROP TRIGGER IF EXISTS enforce_booking_capacity ON "payload"."bookings";
    CREATE TRIGGER enforce_booking_capacity
      BEFORE INSERT OR UPDATE OF "start", "end", status, business_id
      ON "payload"."bookings"
      FOR EACH ROW
      EXECUTE FUNCTION "payload".enforce_booking_capacity();
  `)

  // Not undone, on purpose:
  //  - the getaway booking_capacity = 1 data fix (the old values are not kept,
  //    and 1 is the only value the app accepts for a getaway);
  //  - the added enum values ('platinum', 'landmark-view', the 17 amenities).
  //    Removing one means recreating the type, and the cast back fails as soon
  //    as one row holds it. Unused values are harmless; a deliberate downgrade
  //    of tiers would follow 20260922_110157_two_tiers (rewrite while text).
  // DROP TABLE ... CASCADE removes the foreign keys that point at the dropped
  // tables (brands), so every later drop says IF EXISTS. See 20261119_131549.
  await db.execute(sql`
  ALTER TABLE IF EXISTS "payload"."businesses_facilities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."businesses_popular_facilities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."businesses_property_highlights" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."businesses_stay_packages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."businesses_stay_packages_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."businesses_seating_areas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."businesses_seating_areas_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."brands" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."brands_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload"."bookings_price_lines" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "payload"."businesses_facilities" CASCADE;
  DROP TABLE IF EXISTS "payload"."businesses_popular_facilities" CASCADE;
  DROP TABLE IF EXISTS "payload"."businesses_property_highlights" CASCADE;
  DROP TABLE IF EXISTS "payload"."businesses_stay_packages" CASCADE;
  DROP TABLE IF EXISTS "payload"."businesses_stay_packages_locales" CASCADE;
  DROP TABLE IF EXISTS "payload"."businesses_seating_areas" CASCADE;
  DROP TABLE IF EXISTS "payload"."businesses_seating_areas_locales" CASCADE;
  DROP TABLE IF EXISTS "payload"."brands" CASCADE;
  DROP TABLE IF EXISTS "payload"."brands_locales" CASCADE;
  DROP TABLE IF EXISTS "payload"."bookings_price_lines" CASCADE;
  ALTER TABLE "payload"."businesses" DROP CONSTRAINT IF EXISTS "businesses_brand_id_brands_id_fk";
  ALTER TABLE "payload"."media" DROP CONSTRAINT IF EXISTS "media_uploaded_by_id_business_users_id_fk";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_brands_fk";
  DROP INDEX IF EXISTS "payload"."businesses_brand_idx";
  DROP INDEX IF EXISTS "payload"."media_uploaded_by_idx";
  DROP INDEX IF EXISTS "payload"."media_attached_idx";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_brands_id_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "brand_id";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "map_url";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "stay_nightly_price";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "stay_extra_guest_fee";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "stay_included_guests";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "stay_max_guests";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "stay_min_nights";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "stay_children_count_as_guests";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "features_music_allowed";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "features_events_hosted";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "features_parties_allowed";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "features_garden_access";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "features_barbecue";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "features_pool";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_phone";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_whatsapp";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_email";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_instagram";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_facebook";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_tiktok";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_snapchat";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_youtube";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_x";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "contact_linkedin";
  ALTER TABLE "payload"."bookings" DROP COLUMN IF EXISTS "area";
  ALTER TABLE "payload"."bookings" DROP COLUMN IF EXISTS "price_total";
  ALTER TABLE "payload"."bookings" DROP COLUMN IF EXISTS "price_currency";
  ALTER TABLE "payload"."bookings" DROP COLUMN IF EXISTS "price_nights";
  ALTER TABLE "payload"."bookings" DROP COLUMN IF EXISTS "price_quoted_at";
  ALTER TABLE "payload"."media" DROP COLUMN IF EXISTS "uploaded_by_id";
  ALTER TABLE "payload"."media" DROP COLUMN IF EXISTS "attached";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "brands_id";
  ALTER TABLE "payload"."settings" DROP COLUMN IF EXISTS "max_gold_per_category";
  ALTER TABLE "payload"."settings" DROP COLUMN IF EXISTS "max_platinum";
  DROP TYPE IF EXISTS "payload"."enum_businesses_facilities";
  DROP TYPE IF EXISTS "payload"."enum_businesses_popular_facilities";
  DROP TYPE IF EXISTS "payload"."enum_businesses_property_highlights";
  DROP TYPE IF EXISTS "payload"."enum_businesses_stay_packages_unit";
  DROP TYPE IF EXISTS "payload"."enum_businesses_seating_areas_setting";
  DROP TYPE IF EXISTS "payload"."enum_bookings_area";

  -- The three dropped columns come back empty: their values went with the up.
  ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "submission_public_phone" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "submission_website" varchar;
  ALTER TABLE "payload"."settings" ADD COLUMN IF NOT EXISTS "gold_places" numeric;`)
}
