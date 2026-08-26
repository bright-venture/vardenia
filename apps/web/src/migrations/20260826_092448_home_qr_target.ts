import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds `home` to the QR target types, for a code that opens the site itself.
 *
 * # Two things to know before running this
 *
 * `ALTER TYPE ... ADD VALUE` inside a transaction was a hard error before
 * Postgres 12. Payload wraps every migration in one, so this only works because
 * Supabase is well past that - and it works only because nothing here *uses*
 * the new value, which is still forbidden in the same transaction. Do not add
 * an UPDATE setting a row to 'home' to this file; write a second migration.
 *
 * `down` will fail, on purpose, if any code is already set to `home`. Postgres
 * cannot remove a value from an enum, so rolling back means rebuilding the type
 * without it, and the cast at the end refuses any row that still holds it. That
 * error is the correct outcome: those codes may be printed, and silently
 * rewriting them to something else would break a symbol that cannot be recalled.
 * Re-point them by hand first if a rollback is genuinely wanted.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // IF NOT EXISTS added to the generated statement. Payload rolls a failed
  // migration back, but a value already added by drizzle push - which is how
  // every non-production database here gets its schema - would make this throw
  // on an environment that is otherwise perfectly correct. That is exactly the
  // shape of the failure google_rating hit.
  await db.execute(sql`
   ALTER TYPE "payload"."enum_qr_codes_target_type" ADD VALUE IF NOT EXISTS 'home';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."qr_codes" ALTER COLUMN "target_type" SET DATA TYPE text;
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "target_type" SET DEFAULT 'business'::text;
  DROP TYPE "payload"."enum_qr_codes_target_type";
  CREATE TYPE "payload"."enum_qr_codes_target_type" AS ENUM('business', 'article', 'issue', 'category', 'external');
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "target_type" SET DEFAULT 'business'::"payload"."enum_qr_codes_target_type";
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "target_type" SET DATA TYPE "payload"."enum_qr_codes_target_type" USING "target_type"::"payload"."enum_qr_codes_target_type";`)
}
