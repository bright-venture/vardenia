import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_bookings_locale" AS ENUM('en', 'ar');
  ALTER TABLE "payload"."bookings" ADD COLUMN "locale" "payload"."enum_bookings_locale" DEFAULT 'en';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."bookings" DROP COLUMN "locale";
  DROP TYPE "payload"."enum_bookings_locale";`)
}
