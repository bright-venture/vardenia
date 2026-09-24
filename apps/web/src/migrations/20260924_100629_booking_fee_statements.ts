import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Booking fees: the fee settings on each listing, and the monthly statements.
 *
 * Generated, with one addition by hand at the end of `up`: row level security
 * on the two new tables. `migrate:create` never writes it, and a table created
 * after 20260826_140000_row_level_security arrives without it - which would
 * leave venues' invoices readable through the Supabase API. See
 * docs/DATABASE-SETUP.md. Regenerating this file drops those lines; put them
 * back.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_businesses_booking_fee_unit" AS ENUM('guest', 'night', 'booking');
  CREATE TYPE "payload"."enum__businesses_v_version_booking_fee_unit" AS ENUM('guest', 'night', 'booking');
  CREATE TYPE "payload"."enum_statements_lines_unit" AS ENUM('guest', 'night', 'booking');
  CREATE TYPE "payload"."enum_statements_lines_dispute_outcome" AS ENUM('none', 'open', 'upheld', 'rejected');
  CREATE TYPE "payload"."enum_statements_status" AS ENUM('draft', 'sent', 'paid', 'void');
  CREATE TYPE "payload"."enum_statements_payment_method" AS ENUM('whish', 'bank', 'card', 'cash');
  CREATE TABLE "payload"."statements_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"booking_id" integer,
  	"reference" varchar,
  	"day" varchar,
  	"unit" "payload"."enum_statements_lines_unit",
  	"quantity" numeric,
  	"rate" numeric,
  	"amount" numeric,
  	"dispute_outcome" "payload"."enum_statements_lines_dispute_outcome" DEFAULT 'none',
  	"dispute_reason" varchar,
  	"disputed_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."statements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" varchar,
  	"business_id" integer NOT NULL,
  	"period" varchar NOT NULL,
  	"status" "payload"."enum_statements_status" DEFAULT 'draft' NOT NULL,
  	"vat_rate" numeric DEFAULT 0,
  	"subtotal" numeric,
  	"vat" numeric,
  	"total" numeric,
  	"sent_at" timestamp(3) with time zone,
  	"dispute_until" timestamp(3) with time zone,
  	"due_at" timestamp(3) with time zone,
  	"paid_at" timestamp(3) with time zone,
  	"payment_method" "payload"."enum_statements_payment_method",
  	"payment_reference" varchar,
  	"internal_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_fee_unit" "payload"."enum_businesses_booking_fee_unit";
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_fee_amount" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_fee_cap" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_fee_waived_until" timestamp(3) with time zone;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_fee_unit" "payload"."enum__businesses_v_version_booking_fee_unit";
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_fee_amount" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_fee_cap" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_fee_waived_until" timestamp(3) with time zone;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "statements_id" integer;
  ALTER TABLE "payload"."statements_lines" ADD CONSTRAINT "statements_lines_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "payload"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."statements_lines" ADD CONSTRAINT "statements_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."statements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."statements" ADD CONSTRAINT "statements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "statements_lines_order_idx" ON "payload"."statements_lines" USING btree ("_order");
  CREATE INDEX "statements_lines_parent_id_idx" ON "payload"."statements_lines" USING btree ("_parent_id");
  CREATE INDEX "statements_lines_booking_idx" ON "payload"."statements_lines" USING btree ("booking_id");
  CREATE UNIQUE INDEX "statements_number_idx" ON "payload"."statements" USING btree ("number");
  CREATE INDEX "statements_business_idx" ON "payload"."statements" USING btree ("business_id");
  CREATE INDEX "statements_period_idx" ON "payload"."statements" USING btree ("period");
  CREATE INDEX "statements_status_idx" ON "payload"."statements" USING btree ("status");
  CREATE INDEX "statements_due_at_idx" ON "payload"."statements" USING btree ("due_at");
  CREATE INDEX "statements_updated_at_idx" ON "payload"."statements" USING btree ("updated_at");
  CREATE INDEX "statements_created_at_idx" ON "payload"."statements" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_statements_fk" FOREIGN KEY ("statements_id") REFERENCES "payload"."statements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_statements_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("statements_id");`)

  // By hand, and keep it: see the note at the top of this file.
  await db.execute(sql`
   ALTER TABLE "payload"."statements" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."statements_lines" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."statements_lines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."statements" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."statements_lines" CASCADE;
  DROP TABLE "payload"."statements" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_statements_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_statements_id_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_fee_unit";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_fee_amount";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_fee_cap";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_fee_waived_until";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_booking_fee_unit";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_booking_fee_amount";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_booking_fee_cap";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_booking_fee_waived_until";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "statements_id";
  DROP TYPE "payload"."enum_businesses_booking_fee_unit";
  DROP TYPE "payload"."enum__businesses_v_version_booking_fee_unit";
  DROP TYPE "payload"."enum_statements_lines_unit";
  DROP TYPE "payload"."enum_statements_lines_dispute_outcome";
  DROP TYPE "payload"."enum_statements_status";
  DROP TYPE "payload"."enum_statements_payment_method";`)
}
