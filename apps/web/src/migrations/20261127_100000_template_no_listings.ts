import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Pages without listings in templates (27 November 2026). Adds:
 *  - `no-listings` to `enum_templates_pages_layout`: a template page that
 *    sells nothing (cover, contents, a governorate's separator). It counts as
 *    one page and makes no slot. Only templates have it: the issue price table
 *    (`enum_issues_layouts_layout`) and a business's layout
 *    (`enum_businesses_page_layout`) keep the five layouts;
 *  - `templates_pages.note`, an optional short note saying what a page is.
 *
 * Data: none. Existing templates keep their pages as they are.
 *
 * `down` drops the note column. Postgres cannot drop a value from an enum, so
 * `no-listings` stays in the type; that is harmless, nothing else reads it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- The ALTERs take heavy locks while old code still serves traffic.
  SET LOCAL lock_timeout = '5s';
  -- The new value is not used inside this migration, so adding it in a
  -- transaction is fine on Postgres 12+.
  ALTER TYPE "payload"."enum_templates_pages_layout" ADD VALUE IF NOT EXISTS 'no-listings';
  ALTER TABLE "payload"."templates_pages" ADD COLUMN IF NOT EXISTS "note" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  SET LOCAL lock_timeout = '5s';
  ALTER TABLE "payload"."templates_pages" DROP COLUMN IF EXISTS "note";
  -- 'no-listings' stays in enum_templates_pages_layout: Postgres cannot drop an
  -- enum value. Harmless once no row uses it.`)
}
