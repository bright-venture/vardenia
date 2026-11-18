import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * How many of a booking's party are children (18 November 2026), asked on
 * hotel bookings. One column, default 0, so every existing booking reads as
 * it did.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."bookings" ADD COLUMN "children" numeric DEFAULT 0;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."bookings" DROP COLUMN "children";`)
}
