import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Tiers become `basic` and `silver`, and featured becomes a flag of its own.
 *
 * The tier now answers one question, whether the venue is in print: `basic` is
 * the website listing alone, `silver` a magazine page with the website listing
 * included. Featured - the home page band, and first place in every grid - is
 * an add-on either tier can buy, so it is a boolean beside the tier rather than
 * a third value above it. See packages/core/src/tiers.
 *
 * # What happens to the rows
 *
 * A listing on `featured` keeps everything it had: it becomes `silver` (it was
 * already in print, since featured included the magazine) with the new flag
 * ticked. Every `free` listing - all of them imported from the magazine -
 * becomes `silver`. At the time of writing that is one featured row in
 * production and the rest free.
 *
 * `online` and `free` also stand in for a database that went through the
 * short-lived version of this change, where the tiers were called that: they
 * become `basic` and `silver`. That version was never deployed, but the dev
 * database can carry it from a schema push.
 *
 * # The rewrite has to happen while the column is text
 *
 * The same trap 20260922_110157_two_tiers describes: casting straight to a
 * narrower enum fails on the first row that still says `featured`. So the rows
 * are rewritten while the column is plain text, and only then is the new type
 * put back. The versions table gets the same treatment, because its rows carry
 * the same values.
 *
 * `basic` is declared before `silver` because the directory sorts on `-tier`,
 * which Postgres reads as declaration order, and a magazine listing should sort
 * above a website-only one.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN IF NOT EXISTS "version_featured" boolean DEFAULT false;

  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE text;
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'silver'::text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'silver'::text;

  UPDATE "payload"."businesses" SET "featured" = true, "tier" = 'silver' WHERE "tier" = 'featured';
  UPDATE "payload"."businesses" SET "tier" = 'silver' WHERE "tier" = 'free';
  UPDATE "payload"."businesses" SET "tier" = 'basic' WHERE "tier" = 'online';
  UPDATE "payload"."_businesses_v" SET "version_featured" = true, "version_tier" = 'silver' WHERE "version_tier" = 'featured';
  UPDATE "payload"."_businesses_v" SET "version_tier" = 'silver' WHERE "version_tier" = 'free';
  UPDATE "payload"."_businesses_v" SET "version_tier" = 'basic' WHERE "version_tier" = 'online';

  DROP TYPE "payload"."enum_businesses_tier";
  CREATE TYPE "payload"."enum_businesses_tier" AS ENUM('basic', 'silver');
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'silver'::"payload"."enum_businesses_tier";
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE "payload"."enum_businesses_tier" USING "tier"::"payload"."enum_businesses_tier";

  DROP TYPE "payload"."enum__businesses_v_version_tier";
  CREATE TYPE "payload"."enum__businesses_v_version_tier" AS ENUM('basic', 'silver');
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'silver'::"payload"."enum__businesses_v_version_tier";
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE "payload"."enum__businesses_v_version_tier" USING "version_tier"::"payload"."enum__businesses_v_version_tier";

  CREATE INDEX IF NOT EXISTS "businesses_featured_idx" ON "payload"."businesses" USING btree ("featured");
  CREATE INDEX IF NOT EXISTS "_businesses_v_version_version_featured_idx" ON "payload"."_businesses_v" USING btree ("version_featured");`)
}

/**
 * Back to `free` and `featured`, with no flag.
 *
 * Lossy, and unavoidably so. A featured listing becomes the `featured` tier
 * whichever tier it was on, so "basic, but featured" comes back as a
 * magazine listing; and a basic listing that was not featured becomes
 * `free`, because the old enum has nothing below it.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE text;
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'free'::text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'free'::text;

  UPDATE "payload"."businesses" SET "tier" = 'featured' WHERE "featured" = true;
  UPDATE "payload"."businesses" SET "tier" = 'free' WHERE "tier" IN ('basic', 'silver');
  UPDATE "payload"."_businesses_v" SET "version_tier" = 'featured' WHERE "version_featured" = true;
  UPDATE "payload"."_businesses_v" SET "version_tier" = 'free' WHERE "version_tier" IN ('basic', 'silver');

  DROP TYPE "payload"."enum_businesses_tier";
  CREATE TYPE "payload"."enum_businesses_tier" AS ENUM('free', 'featured');
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'free'::"payload"."enum_businesses_tier";
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE "payload"."enum_businesses_tier" USING "tier"::"payload"."enum_businesses_tier";

  DROP TYPE "payload"."enum__businesses_v_version_tier";
  CREATE TYPE "payload"."enum__businesses_v_version_tier" AS ENUM('free', 'featured');
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'free'::"payload"."enum__businesses_v_version_tier";
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE "payload"."enum__businesses_v_version_tier" USING "version_tier"::"payload"."enum__businesses_v_version_tier";

  DROP INDEX IF EXISTS "payload"."businesses_featured_idx";
  DROP INDEX IF EXISTS "payload"."_businesses_v_version_version_featured_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "featured";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_featured";`)
}
