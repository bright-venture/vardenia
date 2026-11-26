import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Partner with us merged into Add your business, and Advertise removed (25
 * November 2026, the owner's decision). Settings can no longer hide either
 * page, so their two values leave the hidden-pages list.
 *
 * A row still hiding one of them is deleted first: the page it hid is gone, and
 * the cast below would refuse it. Nothing else changes. A database that gets its
 * schema by push may already lack both values; the rebuild is the same either
 * way.
 *
 * `down` puts the two values back; nothing is hidden by it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "payload"."settings_hidden_pages" WHERE "value"::text IN ('partner-with-us', 'advertise');
  ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_settings_hidden_pages";
  CREATE TYPE "payload"."enum_settings_hidden_pages" AS ENUM('about', 'contact', 'faq', 'add-your-business', 'magazine', 'magazine-issues', 'magazine-articles', 'stay', 'eat-and-drink', 'experiences', 'weddings', 'lifestyle', 'getting-around', 'directory', 'partner-sign-in', 'sign-in', 'privacy', 'terms', 'credits');
  ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_settings_hidden_pages" USING "value"::"payload"."enum_settings_hidden_pages";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_settings_hidden_pages";
  CREATE TYPE "payload"."enum_settings_hidden_pages" AS ENUM('about', 'contact', 'faq', 'partner-with-us', 'advertise', 'add-your-business', 'magazine', 'magazine-issues', 'magazine-articles', 'stay', 'eat-and-drink', 'experiences', 'weddings', 'lifestyle', 'getting-around', 'directory', 'partner-sign-in', 'sign-in', 'privacy', 'terms', 'credits');
  ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_settings_hidden_pages" USING "value"::"payload"."enum_settings_hidden_pages";`)
}
