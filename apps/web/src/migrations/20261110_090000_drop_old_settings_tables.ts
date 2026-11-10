import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drops the two settings tables the combined Settings page replaced.
 *
 * 20261105_123458_combined_settings copied the commission rate, the pounds
 * rate and the gold places into `settings`, and left `commission_settings` and
 * `tier_settings` in place for one deploy, so the code still live during that
 * build could keep reading them. That code has long been replaced. Checked on
 * production on 10 November 2026, read-only: both old tables hold the same
 * values as `settings` (rate 10, pounds unset, 6 gold places), and no
 * constraint points at either.
 *
 * Written by hand, like drop_featured_column: Payload's schema snapshot left
 * both tables out when the Settings global replaced them, so there is no schema
 * change for migrate:create to find.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "payload"."commission_settings" CASCADE;
  DROP TABLE IF EXISTS "payload"."tier_settings" CASCADE;`)
}

/** Recreates both as they were, filled from `settings`. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "payload"."commission_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"default_rate" numeric,
  	"pounds_per_dollar" numeric,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  ALTER TABLE "payload"."commission_settings" ENABLE ROW LEVEL SECURITY;
  INSERT INTO "payload"."commission_settings" ("default_rate", "pounds_per_dollar", "updated_at", "created_at")
  SELECT "default_rate", "pounds_per_dollar", now(), now() FROM "payload"."settings" ORDER BY "id" LIMIT 1;

  CREATE TABLE IF NOT EXISTS "payload"."tier_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"gold_places" numeric,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  INSERT INTO "payload"."tier_settings" ("gold_places", "updated_at", "created_at")
  SELECT "gold_places", now(), now() FROM "payload"."settings" ORDER BY "id" LIMIT 1;`)
}
