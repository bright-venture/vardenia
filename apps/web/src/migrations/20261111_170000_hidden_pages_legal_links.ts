import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Privacy, Terms and Credits become footer links the admin can hide
 * (lib/hideable-pages), 11 November 2026. The pages stay up.
 *
 * Additive: values only, nothing hidden. `IF NOT EXISTS` because a database
 * that gets its schema by push already has them. Nothing here uses a new
 * value, which Postgres forbids in the same transaction.
 *
 * `down` rebuilds the type without them, and the cast refuses a row that still
 * holds one: show those links again in Settings first.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'privacy';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'terms';
  ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'credits';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_settings_hidden_pages";
  CREATE TYPE "payload"."enum_settings_hidden_pages" AS ENUM('about', 'contact', 'faq', 'partner-with-us', 'advertise', 'add-your-business', 'magazine', 'magazine-issues', 'magazine-articles', 'stay', 'eat-and-drink', 'experiences', 'weddings', 'lifestyle', 'getting-around', 'directory', 'partner-sign-in', 'sign-in');
  ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_settings_hidden_pages" USING "value"::"payload"."enum_settings_hidden_pages";`)
}
