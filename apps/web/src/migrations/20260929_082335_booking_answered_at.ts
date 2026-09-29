import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."bookings" ADD COLUMN "answered_at" timestamp(3) with time zone;
  CREATE INDEX "bookings_answered_at_idx" ON "payload"."bookings" USING btree ("answered_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."bookings_answered_at_idx";
  ALTER TABLE "payload"."bookings" DROP COLUMN "answered_at";`)
}
