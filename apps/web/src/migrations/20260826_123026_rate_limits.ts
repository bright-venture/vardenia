import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The table behind the shared rate limiter. See collections/RateLimits.
 *
 * `count` is numeric rather than integer because Payload's `number` field maps
 * that way. It matters at the call site: node-postgres returns numeric as a
 * string, so lib/rate-limit-store coerces it rather than comparing a string to
 * a budget.
 *
 * # The down statements are guarded, and the generated ones were not
 *
 * `DROP TABLE ... CASCADE` removes the foreign key on payload_locked_documents_rels
 * along with the table, so the `DROP CONSTRAINT` that follows it finds nothing
 * and fails. Payload wraps a migration in a transaction, so that failure rolls
 * the whole rollback back and leaves the schema exactly where it started, which
 * looks like the command did nothing at all.
 *
 * That is not hypothetical here. It is what happened to google_rating on
 * production three days ago, from the same generator producing the same order.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "payload"."rate_limits" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"count" numeric DEFAULT 0 NOT NULL,
  	"reset_at" timestamp(3) with time zone NOT NULL
  );

  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "rate_limits_id" integer;
  CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_key_idx" ON "payload"."rate_limits" USING btree ("key");
  CREATE INDEX IF NOT EXISTS "rate_limits_reset_at_idx" ON "payload"."rate_limits" USING btree ("reset_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_rate_limits_fk";
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rate_limits_fk" FOREIGN KEY ("rate_limits_id") REFERENCES "payload"."rate_limits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_rate_limits_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("rate_limits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "payload"."rate_limits" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_rate_limits_fk";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_rate_limits_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "rate_limits_id";`)
}
