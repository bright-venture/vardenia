import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * More pages the admin can hide (lib/hideable-pages), 11 November 2026: the
 * magazine's three, the six sections, the directory and the partner sign-in
 * link, besides the six standing pages.
 *
 * Additive: values only, nothing hidden. `IF NOT EXISTS` because a database
 * that gets its schema by push already has them (see home_qr_target). Nothing
 * here uses a new value, which Postgres forbids in the same transaction.
 *
 * `down` rebuilds the type without them, and the cast refuses a row that still
 * holds one: unhide those pages in Settings first.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'magazine';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'magazine-issues';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'magazine-articles';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'stay';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'eat-and-drink';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'experiences';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'weddings';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'lifestyle';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'getting-around';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'directory';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'partner-sign-in';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_settings_hidden_pages";
  CREATE TYPE "payload"."enum_settings_hidden_pages" AS ENUM('about', 'contact', 'faq', 'partner-with-us', 'advertise', 'add-your-business');
  ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_settings_hidden_pages" USING "value"::"payload"."enum_settings_hidden_pages";`)
}
