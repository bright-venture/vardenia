import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * 20 November 2026 (authentication audit, step 7).
 *
 * - The older magazine place requests are removed: the Magazine Places form
 *   now creates business submissions (draft listings), so nothing created
 *   them any more. The table was empty on the test database and never existed
 *   on the live one before this release.
 * - A submission's review status gains 'expired', set by the daily job when
 *   the contract ends.
 *
 * Reordered by hand from the generated version, which dropped the table with
 * CASCADE first and then failed dropping a constraint the cascade had already
 * removed. Every step is guarded, so a partly applied database is fine too.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "payload"."enum_businesses_submission_status" ADD VALUE IF NOT EXISTS 'expired';
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_place_requests_fk";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_place_requests_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "place_requests_id";
  DROP TABLE IF EXISTS "payload"."place_requests" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_place_requests_status";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // 'expired' cannot survive the narrower type below; such a listing goes back
  // to approved, which is what it was before it expired.
  await db.execute(sql`
  UPDATE "payload"."businesses" SET "submission_status" = 'approved' WHERE "submission_status" = 'expired';`)
  await db.execute(sql`
   CREATE TYPE "payload"."enum_place_requests_status" AS ENUM('draft', 'published', 'rejected', 'expired');
  CREATE TABLE "payload"."place_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "payload"."enum_place_requests_status" DEFAULT 'draft' NOT NULL,
  	"business_name" varchar NOT NULL,
  	"issue_id" integer,
  	"place_number" numeric,
  	"contact_name" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"listing_id" integer,
  	"contract_starts_at" timestamp(3) with time zone,
  	"contract_ends_at" timestamp(3) with time zone,
  	"notes" varchar,
  	"internal_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."businesses" ALTER COLUMN "submission_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum_businesses_submission_status";
  CREATE TYPE "payload"."enum_businesses_submission_status" AS ENUM('pending', 'approved', 'rejected');
  ALTER TABLE "payload"."businesses" ALTER COLUMN "submission_status" SET DATA TYPE "payload"."enum_businesses_submission_status" USING "submission_status"::"payload"."enum_businesses_submission_status";
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "place_requests_id" integer;
  ALTER TABLE "payload"."place_requests" ADD CONSTRAINT "place_requests_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "payload"."issues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."place_requests" ADD CONSTRAINT "place_requests_listing_id_businesses_id_fk" FOREIGN KEY ("listing_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "place_requests_status_idx" ON "payload"."place_requests" USING btree ("status");
  CREATE INDEX "place_requests_issue_idx" ON "payload"."place_requests" USING btree ("issue_id");
  CREATE INDEX "place_requests_place_number_idx" ON "payload"."place_requests" USING btree ("place_number");
  CREATE INDEX "place_requests_listing_idx" ON "payload"."place_requests" USING btree ("listing_id");
  CREATE INDEX "place_requests_contract_ends_at_idx" ON "payload"."place_requests" USING btree ("contract_ends_at");
  CREATE INDEX "place_requests_updated_at_idx" ON "payload"."place_requests" USING btree ("updated_at");
  CREATE INDEX "place_requests_created_at_idx" ON "payload"."place_requests" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_place_requests_fk" FOREIGN KEY ("place_requests_id") REFERENCES "payload"."place_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_place_requests_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("place_requests_id");`)
}
