import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Sign in becomes something the admin can hide (lib/hideable-pages), 11
 * November 2026: it takes the header's sign-in and account links away, and the
 * sign-in page stays up.
 *
 * Additive: one value, nothing hidden. `IF NOT EXISTS` because a database that
 * gets its schema by push already has it. Nothing here uses the new value,
 * which Postgres forbids in the same transaction.
 *
 * `down` rebuilds the type without it, and the cast refuses a row that still
 * holds it: show Sign in again in Settings first.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_settings_hidden_pages" ADD VALUE IF NOT EXISTS 'sign-in';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_settings_hidden_pages";
  CREATE TYPE "payload"."enum_settings_hidden_pages" AS ENUM('about', 'contact', 'faq', 'partner-with-us', 'advertise', 'add-your-business', 'magazine', 'magazine-issues', 'magazine-articles', 'stay', 'eat-and-drink', 'experiences', 'weddings', 'lifestyle', 'getting-around', 'directory', 'partner-sign-in');
  ALTER TABLE "payload"."settings_hidden_pages" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_settings_hidden_pages" USING "value"::"payload"."enum_settings_hidden_pages";`)
}
