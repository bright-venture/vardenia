import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Removes the A/B/C page design of the Magazine Places form (27 November
 * 2026). The owner no longer chooses Hero, Editorial or Cover: the page is the
 * issue's own template, and the form's preview shows that page. Drops:
 *  - `businesses.submission_page_template`;
 *  - its enum `enum_businesses_submission_page_template`.
 *
 * Data: the A, B or C a submission stored is lost. Nothing reads it any more
 * (the form, the admin review and the emails stopped using it in the same
 * change). On the development database it was dropped by hand the same day,
 * with the owner's agreement: 18 rows held "a" and 4 held "b".
 *
 * `down` brings back the empty column and its type; the old values do not
 * come back.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- The ALTER takes a heavy lock while old code still serves traffic.
  SET LOCAL lock_timeout = '5s';
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "submission_page_template";
  DROP TYPE IF EXISTS "payload"."enum_businesses_submission_page_template";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  SET LOCAL lock_timeout = '5s';
  DO $$ BEGIN
    CREATE TYPE "payload"."enum_businesses_submission_page_template" AS ENUM('a', 'b', 'c');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  ALTER TABLE "payload"."businesses"
    ADD COLUMN IF NOT EXISTS "submission_page_template" "payload"."enum_businesses_submission_page_template";`)
}
