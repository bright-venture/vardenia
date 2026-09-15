import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Room types for stay bookings, and the `room_type` a booking records.
 *
 * # Why this was hand-trimmed from what migrate:create produced
 *
 * The generator diffs the schema against the last snapshot, and the most recent
 * snapshot predates the locale expansion (20260911 is a hand-written migration
 * with no snapshot of its own). So migrate:create folded the eight-locale enum
 * ADD VALUEs back into this file's up - statements that are already applied
 * everywhere, use a plain ADD VALUE that errors on a value that exists, cannot
 * run inside a migration's transaction, and whose generated down would rebuild
 * the enums back to en/ar and take every translated row with them. None of that
 * belongs in a migration about room types, so it is removed. What stays is the
 * additive delta this change actually introduces: two array tables and one
 * column, all new.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "payload"."businesses_booking_room_types" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"note" varchar
  );

  CREATE TABLE "payload"."_businesses_v_version_booking_room_types" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"note" varchar,
  	"_uuid" varchar
  );

  ALTER TABLE "payload"."bookings" ADD COLUMN "room_type" varchar;

  ALTER TABLE "payload"."businesses_booking_room_types" ADD CONSTRAINT "businesses_booking_room_types_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_version_booking_room_types" ADD CONSTRAINT "_businesses_v_version_booking_room_types_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_businesses_v"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "businesses_booking_room_types_order_idx" ON "payload"."businesses_booking_room_types" USING btree ("_order");
  CREATE INDEX "businesses_booking_room_types_parent_id_idx" ON "payload"."businesses_booking_room_types" USING btree ("_parent_id");
  CREATE INDEX "_businesses_v_version_booking_room_types_order_idx" ON "payload"."_businesses_v_version_booking_room_types" USING btree ("_order");
  CREATE INDEX "_businesses_v_version_booking_room_types_parent_id_idx" ON "payload"."_businesses_v_version_booking_room_types" USING btree ("_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."bookings" DROP COLUMN IF EXISTS "room_type";
  DROP TABLE IF EXISTS "payload"."_businesses_v_version_booking_room_types" CASCADE;
  DROP TABLE IF EXISTS "payload"."businesses_booking_room_types" CASCADE;`)
}
