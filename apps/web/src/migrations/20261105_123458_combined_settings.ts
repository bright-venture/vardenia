import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * One Settings page instead of two (globals/Settings): the commission rate and
 * the pounds rate, from the old Commissions page, and the gold places, from
 * the old Tiers page.
 *
 * The values are copied across, so nothing the team set is lost.
 *
 * # The old tables stay, for one deploy
 *
 * Netlify runs this before it builds the new code, and the site already live
 * keeps serving the old code until the build finishes. That code reads the
 * rate from `commission_settings`, so dropping it here would break billing and
 * receipts for the length of the build. They are left in place, no longer
 * read or written, and a later migration drops them once this code is live.
 * Payload's schema snapshot already leaves them out, so that one is written by
 * hand.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "payload"."settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"default_rate" numeric,
  	"pounds_per_dollar" numeric,
  	"gold_places" numeric,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  INSERT INTO "payload"."settings" ("default_rate", "pounds_per_dollar", "gold_places", "updated_at", "created_at")
  SELECT
    (SELECT "default_rate" FROM "payload"."commission_settings" ORDER BY "id" LIMIT 1),
    (SELECT "pounds_per_dollar" FROM "payload"."commission_settings" ORDER BY "id" LIMIT 1),
    (SELECT "gold_places" FROM "payload"."tier_settings" ORDER BY "id" LIMIT 1),
    now(), now()
  WHERE EXISTS (SELECT 1 FROM "payload"."commission_settings")
     OR EXISTS (SELECT 1 FROM "payload"."tier_settings");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "payload"."commission_settings";
  INSERT INTO "payload"."commission_settings" ("default_rate", "pounds_per_dollar", "updated_at", "created_at")
  SELECT "default_rate", "pounds_per_dollar", now(), now() FROM "payload"."settings" ORDER BY "id" LIMIT 1;
  DELETE FROM "payload"."tier_settings";
  INSERT INTO "payload"."tier_settings" ("gold_places", "updated_at", "created_at")
  SELECT "gold_places", now(), now() FROM "payload"."settings" ORDER BY "id" LIMIT 1;
  DROP TABLE "payload"."settings" CASCADE;`)
}
