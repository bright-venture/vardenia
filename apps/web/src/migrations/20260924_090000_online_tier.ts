import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A third listing tier, `online`: the website listing without a magazine page.
 *
 * `free` now means a page in the printed magazine, with the website listing
 * included, and `featured` adds the home page. See packages/core/src/tiers.
 *
 * # BEFORE 'free', because the order is the ranking
 *
 * The directory sorts on `-tier`, which Postgres reads as the enum's declaration
 * order. An online-only listing pays less than a magazine one and sorts below
 * it, so the new value goes first. Appended at the end instead, every
 * online-only listing would rise above the featured ones.
 *
 * `IF NOT EXISTS`, as in the earlier enum migrations here: an enum value cannot
 * be dropped, so a re-run has to be harmless, and the dev database will already
 * have it from its own schema push. No row changes: every existing listing
 * stays where it is.
 *
 * # `down` rewrites before it narrows
 *
 * The same trap 20260922_110157_two_tiers describes: casting straight back to a
 * two-value enum fails on the first `online` row. So those rows become `free`
 * while the column is text, and only then is the narrower type put back.
 * Lossy: rolling back cannot remember which listings bought only the website.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_businesses_tier" ADD VALUE IF NOT EXISTS 'online' BEFORE 'free';
  ALTER TYPE "payload"."enum__businesses_v_version_tier" ADD VALUE IF NOT EXISTS 'online' BEFORE 'free';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE text;
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'free'::text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'free'::text;
  UPDATE "payload"."businesses" SET "tier" = 'free' WHERE "tier" = 'online';
  UPDATE "payload"."_businesses_v" SET "version_tier" = 'free' WHERE "version_tier" = 'online';
  DROP TYPE "payload"."enum_businesses_tier";
  CREATE TYPE "payload"."enum_businesses_tier" AS ENUM('free', 'featured');
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'free'::"payload"."enum_businesses_tier";
  ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE "payload"."enum_businesses_tier" USING "tier"::"payload"."enum_businesses_tier";
  DROP TYPE "payload"."enum__businesses_v_version_tier";
  CREATE TYPE "payload"."enum__businesses_v_version_tier" AS ENUM('free', 'featured');
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'free'::"payload"."enum__businesses_v_version_tier";
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE "payload"."enum__businesses_v_version_tier" USING "version_tier"::"payload"."enum__businesses_v_version_tier";`)
}
