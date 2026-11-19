import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Magazine place requests (19 November 2026): the `place_requests` table with
 * its four statuses (draft, published, rejected, expired), and a new QR code
 * destination, the magazine places page. Only additions. Row level security
 * on, like every table here.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_place_requests_status" AS ENUM('draft', 'published', 'rejected', 'expired');
  ALTER TYPE "payload"."enum_qr_codes_target_type" ADD VALUE 'magazine-places';
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
  CREATE INDEX "payload_locked_documents_rels_place_requests_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("place_requests_id");
  ALTER TABLE "payload"."place_requests" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."place_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."place_requests" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_place_requests_fk";
  
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "target_type" SET DATA TYPE text;
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "target_type" SET DEFAULT 'business'::text;
  DROP TYPE "payload"."enum_qr_codes_target_type";
  CREATE TYPE "payload"."enum_qr_codes_target_type" AS ENUM('business', 'article', 'issue', 'category', 'external', 'home');
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "target_type" SET DEFAULT 'business'::"payload"."enum_qr_codes_target_type";
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "target_type" SET DATA TYPE "payload"."enum_qr_codes_target_type" USING "target_type"::"payload"."enum_qr_codes_target_type";
  DROP INDEX "payload"."payload_locked_documents_rels_place_requests_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "place_requests_id";
  DROP TYPE "payload"."enum_place_requests_status";`)
}
