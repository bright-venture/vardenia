import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_reviews_status" AS ENUM('pending', 'published', 'rejected');
  CREATE TABLE "payload"."reviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" integer NOT NULL,
  	"rating" numeric NOT NULL,
  	"title" varchar,
  	"body" varchar NOT NULL,
  	"author_name" varchar NOT NULL,
  	"status" "payload"."enum_reviews_status" DEFAULT 'pending' NOT NULL,
  	"customer_id" integer,
  	"booking_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "reviews_id" integer;
  ALTER TABLE "payload"."reviews" ADD CONSTRAINT "reviews_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "payload"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "payload"."bookings"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "reviews_business_idx" ON "payload"."reviews" USING btree ("business_id");
  CREATE INDEX "reviews_status_idx" ON "payload"."reviews" USING btree ("status");
  CREATE INDEX "reviews_customer_idx" ON "payload"."reviews" USING btree ("customer_id");
  CREATE INDEX "reviews_booking_idx" ON "payload"."reviews" USING btree ("booking_id");
  CREATE INDEX "reviews_updated_at_idx" ON "payload"."reviews" USING btree ("updated_at");
  CREATE INDEX "reviews_created_at_idx" ON "payload"."reviews" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reviews_fk" FOREIGN KEY ("reviews_id") REFERENCES "payload"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_reviews_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("reviews_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."reviews" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."reviews" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reviews_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_reviews_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "reviews_id";
  DROP TYPE "payload"."enum_reviews_status";`)
}
