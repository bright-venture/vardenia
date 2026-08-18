import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_bookings_status" AS ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no-show');
  CREATE TABLE "payload"."bookings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"reference" varchar,
  	"business_id" integer NOT NULL,
  	"customer_id" integer NOT NULL,
  	"start" timestamp(3) with time zone NOT NULL,
  	"end" timestamp(3) with time zone NOT NULL,
  	"party_size" numeric DEFAULT 2 NOT NULL,
  	"status" "payload"."enum_bookings_status" DEFAULT 'pending' NOT NULL,
  	"notes" varchar,
  	"internal_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_auto_confirm" boolean DEFAULT false;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_capacity" numeric DEFAULT 1;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_min_party_size" numeric DEFAULT 1;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_max_party_size" numeric DEFAULT 8;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_lead_time_minutes" numeric DEFAULT 60;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_max_advance_days" numeric DEFAULT 180;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_min_duration_minutes" numeric DEFAULT 60;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_max_duration_minutes" numeric DEFAULT 240;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_auto_confirm" boolean DEFAULT false;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_capacity" numeric DEFAULT 1;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_min_party_size" numeric DEFAULT 1;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_max_party_size" numeric DEFAULT 8;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_lead_time_minutes" numeric DEFAULT 60;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_max_advance_days" numeric DEFAULT 180;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_min_duration_minutes" numeric DEFAULT 60;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_max_duration_minutes" numeric DEFAULT 240;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "bookings_id" integer;
  ALTER TABLE "payload"."bookings" ADD CONSTRAINT "bookings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "payload"."customers"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "bookings_reference_idx" ON "payload"."bookings" USING btree ("reference");
  CREATE INDEX "bookings_business_idx" ON "payload"."bookings" USING btree ("business_id");
  CREATE INDEX "bookings_customer_idx" ON "payload"."bookings" USING btree ("customer_id");
  CREATE INDEX "bookings_start_idx" ON "payload"."bookings" USING btree ("start");
  CREATE INDEX "bookings_status_idx" ON "payload"."bookings" USING btree ("status");
  CREATE INDEX "bookings_updated_at_idx" ON "payload"."bookings" USING btree ("updated_at");
  CREATE INDEX "bookings_created_at_idx" ON "payload"."bookings" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bookings_fk" FOREIGN KEY ("bookings_id") REFERENCES "payload"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_bookings_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("bookings_id");`)
}

/**
 * Rewritten from what was generated, for the reason the Pages removal documents:
 * DROP TABLE ... CASCADE already removes the foreign keys and indexes pointing
 * at the table, so the explicit drops that follow refer to things that no longer
 * exist and abort the whole batch. Every statement here is IF EXISTS, and
 * dropping a column takes its index and constraint with it.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "bookings_id";

  DROP TABLE IF EXISTS "payload"."bookings" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_bookings_status";

  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_enabled";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_auto_confirm";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_capacity";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_min_party_size";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_max_party_size";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_lead_time_minutes";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_max_advance_days";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_min_duration_minutes";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "booking_max_duration_minutes";

  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_enabled";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_auto_confirm";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_capacity";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_min_party_size";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_max_party_size";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_lead_time_minutes";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_max_advance_days";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_min_duration_minutes";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_booking_max_duration_minutes";`)
}
