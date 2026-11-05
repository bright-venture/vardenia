import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Tiers become a ladder: bronze, silver, gold (packages/core/src/tiers).
 *
 * `basic` is renamed `bronze`, and the `featured` flag becomes the `gold`
 * tier: every featured listing is gold. The tier column is text while the enum
 * is rebuilt, so the rows are moved then, before the cast back; the same for
 * the version history. The down migration gives gold back its featured flag on
 * silver.
 *
 * # The `featured` column stays, for one deploy
 *
 * Netlify runs this before it builds the new code, and the site already live
 * keeps serving the old code until the build finishes. That code sorts every
 * listing grid on `featured`, so dropping the column here would break every
 * listing page for the length of the build. It is left in place, no longer
 * read or written, and a later migration drops it once this code is live.
 * Payload's schema snapshot already leaves it out, so that migration is
 * written by hand: `migrate:create` will not notice an extra column.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE text;
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'silver'::text;
  UPDATE "payload"."businesses" SET "tier" = 'bronze' WHERE "tier" = 'basic';
  UPDATE "payload"."businesses" SET "tier" = 'gold' WHERE "featured" IS TRUE;
  DROP TYPE "payload"."enum_businesses_tier";
  CREATE TYPE "payload"."enum_businesses_tier" AS ENUM('bronze', 'silver', 'gold');
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'silver'::"payload"."enum_businesses_tier";
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE "payload"."enum_businesses_tier" USING "tier"::"payload"."enum_businesses_tier";

  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'silver'::text;
  UPDATE "payload"."_businesses_v" SET "version_tier" = 'bronze' WHERE "version_tier" = 'basic';
  UPDATE "payload"."_businesses_v" SET "version_tier" = 'gold' WHERE "version_featured" IS TRUE;
  DROP TYPE "payload"."enum__businesses_v_version_tier";
  CREATE TYPE "payload"."enum__businesses_v_version_tier" AS ENUM('bronze', 'silver', 'gold');
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'silver'::"payload"."enum__businesses_v_version_tier";
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE "payload"."enum__businesses_v_version_tier" USING "version_tier"::"payload"."enum__businesses_v_version_tier";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`

  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE text;
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'silver'::text;
  UPDATE "payload"."businesses" SET "featured" = true, "tier" = 'silver' WHERE "tier" = 'gold';
  UPDATE "payload"."businesses" SET "tier" = 'basic' WHERE "tier" = 'bronze';
  DROP TYPE "payload"."enum_businesses_tier";
  CREATE TYPE "payload"."enum_businesses_tier" AS ENUM('basic', 'silver');
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'silver'::"payload"."enum_businesses_tier";
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE "payload"."enum_businesses_tier" USING "tier"::"payload"."enum_businesses_tier";

  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'silver'::text;
  UPDATE "payload"."_businesses_v" SET "version_featured" = true, "version_tier" = 'silver' WHERE "version_tier" = 'gold';
  UPDATE "payload"."_businesses_v" SET "version_tier" = 'basic' WHERE "version_tier" = 'bronze';
  DROP TYPE "payload"."enum__businesses_v_version_tier";
  CREATE TYPE "payload"."enum__businesses_v_version_tier" AS ENUM('basic', 'silver');
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'silver'::"payload"."enum__businesses_v_version_tier";
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE "payload"."enum__businesses_v_version_tier" USING "version_tier"::"payload"."enum__businesses_v_version_tier";`)
}
