import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Turn on row level security everywhere, and take the write grants off PostGIS.
 *
 * Hand written, not generated. It changes no columns, so `migrate:create` has
 * nothing to diff and would produce an empty file.
 *
 * # Why, when the tables are already unreachable
 *
 * Payload's tables live in the `payload` schema precisely so Supabase's
 * generated REST API cannot address them, and the grants confirm that works:
 * `anon` and `authenticated` hold no privileges there at all. RLS adds nothing
 * against today's arrangement.
 *
 * It matters against tomorrow's. The protection currently rests on one property
 * of the Supabase project - which schemas the API is exposed to - and that is a
 * dashboard setting, not something this repository controls or can test. If it
 * were ever widened to include `payload`, every table would be world readable
 * with the anon key and nothing in the codebase would have changed. With RLS on
 * and no policies written, the same mistake exposes nothing.
 *
 * # Why it does not break the application
 *
 * Checked against both databases before writing this: the connection role is
 * `postgres`, which owns every table in the schema, has `rolbypassrls = true`,
 * and no table sets FORCE ROW LEVEL SECURITY. RLS is therefore invisible to
 * Payload's own queries, twice over.
 *
 * If any of those three facts ever changes, this migration becomes a total
 * outage rather than a hardening measure. That is what the FORCE check in the
 * verification is for.
 *
 * # No policies, on purpose
 *
 * The checklist this came from asks for policies scoped to `auth.uid()`. There
 * is no Supabase Auth here - Payload owns identity, sessions and roles, and
 * `auth.uid()` is null for every connection this application makes. Policies
 * referencing it would be decoration that reads as protection. RLS with no
 * policy denies by default, which is the stricter and more honest answer.
 *
 * # A new table does not inherit this
 *
 * Postgres has no default for it. A collection added later gets a table without
 * RLS, and only the audit check notices. Re-run that check after adding one.
 *
 * # Drizzle push undoes this, so it only holds in production
 *
 * Measured, not suspected: after applying this to the development database, a
 * single `getPayload` in development mode took all 45 tables from RLS on to RLS
 * off. `push` reconciles the schema against the collection definitions, RLS is
 * not part of those definitions, and so it is reset.
 *
 * Production never runs push - payload.config sets `push: NODE_ENV !==
 * 'production'` - so the effect of this migration persists exactly where it is
 * wanted. Development and CI do run it, and will keep losing RLS on every boot.
 *
 * That is why the verification for this points at production. Pointing it at a
 * development database would fail for a reason that has nothing to do with
 * whether the migration works.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'payload' LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'payload', t.tablename);
      END LOOP;
    END $$;
  `)

  /**
   * PostGIS ships spatial_ref_sys into `public` and grants the browser roles
   * full write access to it. That is a Supabase and PostGIS default rather than
   * anything this project chose, and it is the one place an anon key could
   * change data. Reading it is left alone: it is 8500 published coordinate
   * systems, and something may legitimately need them.
   *
   * Wrapped, because the table belongs to the extension and the migration role
   * may not be permitted to alter its grants on every Supabase plan. A refusal
   * here should not roll back the RLS above.
   */
  await db.execute(sql`
    DO $$
    BEGIN
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM anon, authenticated;
    EXCEPTION
      WHEN insufficient_privilege OR undefined_table OR undefined_object THEN
        RAISE NOTICE 'left spatial_ref_sys grants alone: %', SQLERRM;
    END $$;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'payload' LOOP
        EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', 'payload', t.tablename);
      END LOOP;
    END $$;
  `)

  // The grants are not restored. Handing write access on a reference table back
  // to an anonymous role is not something a rollback should do silently.
}
