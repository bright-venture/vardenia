import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Issues for one governorate, split by city (27 November 2026). Adds:
 *  - `issues.coverage` ('all-lebanon' | 'governorate', default 'all-lebanon'),
 *    a new type `enum_issues_coverage`. Existing issues get the default, so
 *    they keep one block per governorate as before;
 *  - `issues.governorate`, the one governorate a 'governorate' issue is for.
 *    It reuses `enum_listing_ranges_governorate` (the field sets `enumName`):
 *    the same seven values as a range's governorate;
 *  - `listing_ranges.city`, the city of a block on such an issue. It reuses
 *    `enum_businesses_city` (the field sets `enumName`): the same cities as a
 *    business's, so a later change of the cities is one ALTER TYPE;
 *  - the unique index on a range goes from (issue, governorate) to
 *    (issue, governorate, city), so a governorate can have one block per city.
 *
 * NULL cities. Postgres treats NULLs as distinct in a unique index, so
 * (issue, governorate, city) alone would let an All Lebanon issue have two
 * governorate-wide blocks for one governorate. A partial unique index on
 * (issue, governorate) WHERE city IS NULL keeps that to one, the old rule.
 * Payload cannot declare a partial index, so it lives here only (as
 * businesses_whish_payment_once_idx does) and is not in the snapshot; the
 * ListingRanges hook refuses the same case first with a readable message.
 * NULLS NOT DISTINCT would do it in one index but needs Postgres 15.
 *
 * Data: none changes. Every existing range has no city and was already unique
 * per (issue, governorate), so both new indexes build on it.
 *
 * `down` refuses while any range has a city: the old (issue, governorate)
 * index cannot hold two city blocks of one governorate, and deleting staff's
 * blocks is not for a migration to decide. Delete those ranges first. Then it
 * drops the columns and the coverage type; the two reused types stay.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- The ALTERs take heavy locks while old code still serves traffic.
  SET LOCAL lock_timeout = '5s';
  DO $$ BEGIN
    CREATE TYPE "payload"."enum_issues_coverage" AS ENUM('all-lebanon', 'governorate');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  ALTER TABLE "payload"."issues" ADD COLUMN IF NOT EXISTS "coverage" "payload"."enum_issues_coverage" DEFAULT 'all-lebanon';
  ALTER TABLE "payload"."issues" ADD COLUMN IF NOT EXISTS "governorate" "payload"."enum_listing_ranges_governorate";
  ALTER TABLE "payload"."listing_ranges" ADD COLUMN IF NOT EXISTS "city" "payload"."enum_businesses_city";
  DROP INDEX IF EXISTS "payload"."issue_governorate_idx";
  CREATE UNIQUE INDEX IF NOT EXISTS "issue_governorate_city_idx" ON "payload"."listing_ranges" USING btree ("issue_id","governorate","city");
  -- One governorate-wide block per governorate per issue (see the note above).
  CREATE UNIQUE INDEX IF NOT EXISTS "listing_ranges_governorate_wide_idx" ON "payload"."listing_ranges" USING btree ("issue_id","governorate") WHERE "city" IS NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  SET LOCAL lock_timeout = '5s';
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "payload"."listing_ranges" WHERE "city" IS NOT NULL) THEN
      RAISE EXCEPTION 'Listing number ranges with a city exist. Delete them before rolling back 20261127_110000_issue_coverage_and_range_city.';
    END IF;
  END $$;
  DROP INDEX IF EXISTS "payload"."listing_ranges_governorate_wide_idx";
  DROP INDEX IF EXISTS "payload"."issue_governorate_city_idx";
  ALTER TABLE "payload"."listing_ranges" DROP COLUMN IF EXISTS "city";
  CREATE UNIQUE INDEX IF NOT EXISTS "issue_governorate_idx" ON "payload"."listing_ranges" USING btree ("issue_id","governorate");
  ALTER TABLE "payload"."issues" DROP COLUMN IF EXISTS "governorate";
  ALTER TABLE "payload"."issues" DROP COLUMN IF EXISTS "coverage";
  DROP TYPE IF EXISTS "payload"."enum_issues_coverage";`)
}
