import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses_locales" ADD COLUMN "booking_cancellation_policy" varchar;
  ALTER TABLE "payload"."_businesses_v_locales" ADD COLUMN "version_booking_cancellation_policy" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses_locales" DROP COLUMN "booking_cancellation_policy";
  ALTER TABLE "payload"."_businesses_v_locales" DROP COLUMN "version_booking_cancellation_policy";`)
}
