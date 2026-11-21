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
