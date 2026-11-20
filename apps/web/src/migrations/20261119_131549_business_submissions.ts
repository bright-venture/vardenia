import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_businesses_submission_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TYPE "payload"."enum_businesses_submission_page_template" AS ENUM('a', 'b', 'c');
  CREATE TYPE "payload"."enum_listing_ranges_governorate" AS ENUM('keserwan', 'north-lebanon', 'beirut', 'beqaa', 'south-lebanon', 'chouf', 'matn');
  CREATE TABLE "payload"."listing_ranges" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"issue_id" integer NOT NULL,
  	"governorate" "payload"."enum_listing_ranges_governorate" NOT NULL,
  	"from" numeric NOT NULL,
  	"to" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."businesses" ADD COLUMN "issue_id" integer;
  ALTER TABLE "payload"."businesses" ADD COLUMN "listing_number" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "submission_status" "payload"."enum_businesses_submission_status";
  ALTER TABLE "payload"."businesses" ADD COLUMN "submission_owner_name" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "submission_owner_email" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "submission_owner_phone" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "submission_public_phone" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "submission_website" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN "submission_page_template" "payload"."enum_businesses_submission_page_template";
  ALTER TABLE "payload"."businesses" ADD COLUMN "submission_submitted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."issues" ADD COLUMN "listing_total" numeric DEFAULT 408;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "listing_ranges_id" integer;
  ALTER TABLE "payload"."listing_ranges" ADD CONSTRAINT "listing_ranges_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "payload"."issues"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "listing_ranges_issue_idx" ON "payload"."listing_ranges" USING btree ("issue_id");
  CREATE INDEX "listing_ranges_updated_at_idx" ON "payload"."listing_ranges" USING btree ("updated_at");
  CREATE INDEX "listing_ranges_created_at_idx" ON "payload"."listing_ranges" USING btree ("created_at");
  CREATE UNIQUE INDEX "issue_governorate_idx" ON "payload"."listing_ranges" USING btree ("issue_id","governorate");
  ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "payload"."issues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_listing_ranges_fk" FOREIGN KEY ("listing_ranges_id") REFERENCES "payload"."listing_ranges"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "businesses_issue_idx" ON "payload"."businesses" USING btree ("issue_id");
  CREATE INDEX "businesses_listing_number_idx" ON "payload"."businesses" USING btree ("listing_number");
  CREATE UNIQUE INDEX "issue_listingNumber_idx" ON "payload"."businesses" USING btree ("issue_id","listing_number");
  CREATE INDEX "payload_locked_documents_rels_listing_ranges_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("listing_ranges_id");

  -- A table created by a later migration arrives without row level security
  -- (see 20260826_140000_row_level_security); the generator does not write this.
  ALTER TABLE "payload"."listing_ranges" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."listing_ranges" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."listing_ranges" CASCADE;
  ALTER TABLE "payload"."businesses" DROP CONSTRAINT IF EXISTS "businesses_issue_id_issues_id_fk";

  -- DROP TABLE ... CASCADE above already removed the locked-documents foreign
  -- key and its index (both point at listing_ranges), so they need IF EXISTS or
  -- the rollback fails. See 20260824_122311_google_rating.ts.
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_listing_ranges_fk";

  DROP INDEX IF EXISTS "payload"."businesses_issue_idx";
  DROP INDEX IF EXISTS "payload"."businesses_listing_number_idx";
  DROP INDEX IF EXISTS "payload"."issue_listingNumber_idx";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_listing_ranges_id_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN "issue_id";
  ALTER TABLE "payload"."businesses" DROP COLUMN "listing_number";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_status";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_owner_name";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_owner_email";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_owner_phone";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_public_phone";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_website";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_page_template";
  ALTER TABLE "payload"."businesses" DROP COLUMN "submission_submitted_at";
  ALTER TABLE "payload"."issues" DROP COLUMN "listing_total";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "listing_ranges_id";
  DROP TYPE "payload"."enum_businesses_submission_status";
  DROP TYPE "payload"."enum_businesses_submission_page_template";
  DROP TYPE "payload"."enum_listing_ranges_governorate";`)
}
