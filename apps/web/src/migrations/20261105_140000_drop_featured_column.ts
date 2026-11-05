import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drops the `featured` column, the second half of 20261105_112151.
 *
 * That migration turned every featured listing into gold and kept the column,
 * because the code still live during the build read it. That code is gone, so
 * the column is read and written by nothing. Written by hand: Payload's schema
 * snapshot already left the column out, so `migrate:create` sees no change.
 *
 * `IF EXISTS`, because a development database synced by push has dropped it
 * already. The down migration brings the column back, filled from gold, as
 * 20261105_112151's own down migration expects.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload"."businesses_featured_idx";
  DROP INDEX IF EXISTS "payload"."_businesses_v_version_version_featured_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "featured";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_featured";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN IF NOT EXISTS "version_featured" boolean DEFAULT false;
  UPDATE "payload"."businesses" SET "featured" = true WHERE "tier" = 'gold';
  UPDATE "payload"."_businesses_v" SET "version_featured" = true WHERE "version_tier" = 'gold';
  CREATE INDEX IF NOT EXISTS "businesses_featured_idx" ON "payload"."businesses" USING btree ("featured");
  CREATE INDEX IF NOT EXISTS "_businesses_v_version_version_featured_idx" ON "payload"."_businesses_v" USING btree ("version_featured");`)
}
