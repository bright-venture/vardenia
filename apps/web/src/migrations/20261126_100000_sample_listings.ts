import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Sample listings (26 November 2026). Adds `is_sample` to businesses, false for
 * every row. This migration changes no data: the owner flags the existing mock
 * listings by hand with an SQL query (is_sample = true, listing_number = NULL),
 * and admins can tick or untick the box in the admin afterwards.
 *
 * NOTE: the Payload snapshot (.json) says this column is nullable, but on
 * production it is NOT NULL (this migration), while databases built by dev push
 * have it nullable. The snapshot is deliberately left as generated.
 *
 * `down` drops the column.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- The ALTER takes an ACCESS EXCLUSIVE lock while old code still serves traffic.
  SET LOCAL lock_timeout = '5s';
  ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "is_sample" boolean DEFAULT false NOT NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "is_sample";`)
}
