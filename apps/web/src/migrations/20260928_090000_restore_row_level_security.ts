import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Turn row level security back on for every table in `payload`.
 *
 * Hand written, like 20260826_140000_row_level_security, which this repeats.
 * It changes no columns, so `migrate:create` would produce an empty file.
 *
 * # What turned it off
 *
 * That migration ran on production on 27 August 2026. On 28 September only 2 of
 * 52 tables had RLS: statements and statements_lines, whose own migration turns
 * it on. Production's payload_migrations holds the row Payload writes when it
 * pushes a schema ("dev", batch -1), last updated 9 September 2026 12:26 UTC.
 * A local run had been pointed at production with NODE_ENV unset, push was on,
 * and push resets RLS on every table because RLS is not part of the collection
 * definitions. That was measured on development when the first migration was
 * written; this is the same thing happening where it matters.
 *
 * payload.config now decides push by the target database rather than by
 * NODE_ENV (mayPushSchema in seed/guard), so production cannot be pushed to
 * again from a laptop.
 *
 * # Safe to run
 *
 * Checked against production before writing it, read-only: the connection role
 * is `postgres`, it owns every table in the schema, it has `rolbypassrls`, and
 * no table sets FORCE ROW LEVEL SECURITY. RLS is invisible to Payload's own
 * queries, as it was for the month it was on. Enabling it on a table where it is
 * already on does nothing, so the two tables that kept it are unaffected.
 *
 * No policies, for the reason the first migration gives: there is no Supabase
 * Auth here, and RLS with no policy denies every other role by default.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'payload' LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'payload', t.tablename);
      END LOOP;
    END $$;
  `)
}

/**
 * Nothing. Rolling this back would switch security off on the live database
 * to undo a change that has no effect on the application, which is not
 * something a rollback should do. 20260826_140000's down is there for anyone
 * who genuinely needs RLS off.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {}
