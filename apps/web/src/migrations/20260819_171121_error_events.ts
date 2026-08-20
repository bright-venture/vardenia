import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The table behind error reporting.
 *
 * One row per distinct bug, not per occurrence - `fingerprint` is unique and
 * `count` goes up. See collections/ErrorEvents and lib/report.
 *
 * Additive: a new table, plus the `error_events_id` column Payload adds to
 * `payload_locked_documents_rels` for every collection. Nothing existing is
 * dropped or altered, so this is safe to run before the code that writes to it
 * is deployed - unlike the contact-column drop, which had to come after.
 *
 * Generated rather than hand-written, and read afterwards. The output was clean
 * this time; the verification migration in August was not, because a hand-written
 * migration had left the snapshots out of step. Worth checking every time.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_error_events_level" AS ENUM('error', 'warning');
  CREATE TABLE "payload"."error_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"fingerprint" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"name" varchar,
  	"source" varchar,
  	"path" varchar,
  	"level" "payload"."enum_error_events_level" DEFAULT 'error',
  	"count" numeric DEFAULT 1,
  	"first_seen" timestamp(3) with time zone,
  	"last_seen" timestamp(3) with time zone,
  	"stack" varchar,
  	"extra" varchar,
  	"resolved" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "error_events_id" integer;
  CREATE UNIQUE INDEX "error_events_fingerprint_idx" ON "payload"."error_events" USING btree ("fingerprint");
  CREATE INDEX "error_events_source_idx" ON "payload"."error_events" USING btree ("source");
  CREATE INDEX "error_events_level_idx" ON "payload"."error_events" USING btree ("level");
  CREATE INDEX "error_events_count_idx" ON "payload"."error_events" USING btree ("count");
  CREATE INDEX "error_events_first_seen_idx" ON "payload"."error_events" USING btree ("first_seen");
  CREATE INDEX "error_events_last_seen_idx" ON "payload"."error_events" USING btree ("last_seen");
  CREATE INDEX "error_events_resolved_idx" ON "payload"."error_events" USING btree ("resolved");
  CREATE INDEX "error_events_updated_at_idx" ON "payload"."error_events" USING btree ("updated_at");
  CREATE INDEX "error_events_created_at_idx" ON "payload"."error_events" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_error_events_fk" FOREIGN KEY ("error_events_id") REFERENCES "payload"."error_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_error_events_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("error_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."error_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."error_events" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_error_events_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_error_events_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "error_events_id";
  DROP TYPE "payload"."enum_error_events_level";`)
}
