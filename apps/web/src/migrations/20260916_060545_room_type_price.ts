import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses_booking_room_types" ADD COLUMN "price" numeric;
  ALTER TABLE "payload"."_businesses_v_version_booking_room_types" ADD COLUMN "price" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses_booking_room_types" DROP COLUMN "price";
  ALTER TABLE "payload"."_businesses_v_version_booking_room_types" DROP COLUMN "price";`)
}
