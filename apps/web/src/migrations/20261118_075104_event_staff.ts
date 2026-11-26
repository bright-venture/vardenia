import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Event Staff requests (18 November 2026): the `staff_requests` table, where a
 * signed-in guest's request for hostesses or waiters lands for the Vardenia
 * team. Only additions. Row level security on, like every table here.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_staff_requests_role" AS ENUM('hostesses', 'waiters');
  CREATE TYPE "payload"."enum_staff_requests_status" AS ENUM('new', 'contacted', 'confirmed', 'declined');
  CREATE TYPE "payload"."enum_staff_requests_event_type" AS ENUM('wedding', 'private-dinner', 'corporate', 'other');
  CREATE TABLE "payload"."staff_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"reference" varchar,
  	"role" "payload"."enum_staff_requests_role" NOT NULL,
  	"status" "payload"."enum_staff_requests_status" DEFAULT 'new' NOT NULL,
  	"customer_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"phone" varchar,
  	"event_type" "payload"."enum_staff_requests_event_type" NOT NULL,
  	"guests" numeric NOT NULL,
  	"staff_wanted" numeric,
  	"event_date" varchar NOT NULL,
  	"start_time" varchar,
  	"hours" numeric,
  	"venue" varchar NOT NULL,
  	"notes" varchar,
  	"locale" varchar,
  	"internal_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "staff_requests_id" integer;
  ALTER TABLE "payload"."staff_requests" ADD CONSTRAINT "staff_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "payload"."customers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "staff_requests_reference_idx" ON "payload"."staff_requests" USING btree ("reference");
  CREATE INDEX "staff_requests_status_idx" ON "payload"."staff_requests" USING btree ("status");
  CREATE INDEX "staff_requests_customer_idx" ON "payload"."staff_requests" USING btree ("customer_id");
  CREATE INDEX "staff_requests_event_date_idx" ON "payload"."staff_requests" USING btree ("event_date");
  CREATE INDEX "staff_requests_updated_at_idx" ON "payload"."staff_requests" USING btree ("updated_at");
  CREATE INDEX "staff_requests_created_at_idx" ON "payload"."staff_requests" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_staff_requests_fk" FOREIGN KEY ("staff_requests_id") REFERENCES "payload"."staff_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_staff_requests_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("staff_requests_id");
  ALTER TABLE "payload"."staff_requests" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."staff_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."staff_requests" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_staff_requests_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_staff_requests_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "staff_requests_id";
  DROP TYPE "payload"."enum_staff_requests_role";
  DROP TYPE "payload"."enum_staff_requests_status";
  DROP TYPE "payload"."enum_staff_requests_event_type";`)
}
