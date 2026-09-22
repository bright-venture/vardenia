import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Four listing tiers become two: `free` and `featured`.
 *
 * `listed` and `partner` described a sales organisation that never existed.
 * Production held 1,276 free listings and one `listed`; nothing was ever sold
 * into the middle. See packages/core/src/tiers.
 *
 * # The rewrite has to happen while the column is text
 *
 * The generated version of this migration dropped the enum, recreated it with
 * two values, and cast the column straight back with
 * `USING "tier"::"enum_businesses_tier"`. That cast fails the moment a single
 * row still says `listed` - which production does - and the failure lands
 * mid-deploy, on the one migration that cannot be half-applied.
 *
 * So the two retired values are rewritten in the window where the column is
 * plain `text` and any string is legal, and only then is the narrower type put
 * back. The same is done for the versions table, whose rows carry the same
 * retired values.
 *
 * # Why they become featured rather than free
 *
 * Both were above free, and demoting somebody who may be paying is the more
 * damaging of the two mistakes - a free listing loses its gallery, its print
 * inclusion and its place in the results. Promoting one listing that turns out
 * not to be paying costs nothing and is a one-click correction in the admin.
 * At the time of writing that is exactly one row in production, Le Royal Hotel.
 *
 * Enum order is load-bearing: the directory sorts on `-tier`, which is Postgres
 * declaration order, so `featured` is declared after `free` to sort above it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE text;
    ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'free'::text;
    ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE text;
    ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'free'::text;

    UPDATE "payload"."businesses" SET "tier" = 'featured'
     WHERE "tier" IN ('listed', 'partner');
    UPDATE "payload"."_businesses_v" SET "version_tier" = 'featured'
     WHERE "version_tier" IN ('listed', 'partner');

    DROP TYPE "payload"."enum_businesses_tier";
    CREATE TYPE "payload"."enum_businesses_tier" AS ENUM('free', 'featured');
    ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DEFAULT 'free'::"payload"."enum_businesses_tier";
    ALTER TABLE "payload"."businesses" ALTER COLUMN "tier" SET DATA TYPE "payload"."enum_businesses_tier" USING "tier"::"payload"."enum_businesses_tier";

    DROP TYPE "payload"."enum__businesses_v_version_tier";
    CREATE TYPE "payload"."enum__businesses_v_version_tier" AS ENUM('free', 'featured');
    ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DEFAULT 'free'::"payload"."enum__businesses_v_version_tier";
    ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_tier" SET DATA TYPE "payload"."enum__businesses_v_version_tier" USING "version_tier"::"payload"."enum__businesses_v_version_tier";
  `)
}

/**
 * Puts the two retired values back on the type.
 *
 * Lossy, and unavoidably so: a listing that was `partner` and a listing that
 * was `listed` both read as `featured` after `up`, and nothing records which
 * was which. Rolling back restores the shape of the enum, not the ladder.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "payload"."enum_businesses_tier" ADD VALUE IF NOT EXISTS 'listed' BEFORE 'featured';
    ALTER TYPE "payload"."enum_businesses_tier" ADD VALUE IF NOT EXISTS 'partner';
    ALTER TYPE "payload"."enum__businesses_v_version_tier" ADD VALUE IF NOT EXISTS 'listed' BEFORE 'featured';
    ALTER TYPE "payload"."enum__businesses_v_version_tier" ADD VALUE IF NOT EXISTS 'partner';
  `)
}
