import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The booking form's id for one attempt (Bookings `requestId`).
 *
 * Unique, because that is what holds when two copies of the same request arrive
 * together: the second insert is refused and lib/booking-service answers with
 * the booking the first one made. Nullable, so every existing booking and any
 * request from an older form is unaffected; Postgres allows any number of nulls
 * under a unique index.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."bookings" ADD COLUMN "request_id" varchar;
  CREATE UNIQUE INDEX "bookings_request_id_idx" ON "payload"."bookings" USING btree ("request_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."bookings_request_id_idx";
  ALTER TABLE "payload"."bookings" DROP COLUMN "request_id";`)
}
