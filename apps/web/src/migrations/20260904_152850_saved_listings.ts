import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."saved_listings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_id" integer NOT NULL,
  	"listing_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "saved_listings_id" integer;
  ALTER TABLE "payload"."saved_listings" ADD CONSTRAINT "saved_listings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "payload"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."saved_listings" ADD CONSTRAINT "saved_listings_listing_id_businesses_id_fk" FOREIGN KEY ("listing_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "saved_listings_customer_idx" ON "payload"."saved_listings" USING btree ("customer_id");
  CREATE INDEX "saved_listings_listing_idx" ON "payload"."saved_listings" USING btree ("listing_id");
  CREATE INDEX "saved_listings_updated_at_idx" ON "payload"."saved_listings" USING btree ("updated_at");
  CREATE INDEX "saved_listings_created_at_idx" ON "payload"."saved_listings" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_saved_listings_fk" FOREIGN KEY ("saved_listings_id") REFERENCES "payload"."saved_listings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_saved_listings_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("saved_listings_id");`)

  /**
   * Row Level Security, added by hand.
   *
   * `migrate:create` does not write this, and Postgres turns RLS on for no table
   * by default, so a table created after the hardening migration arrives without
   * it and nothing complains. With no policies, RLS denies by default, which is
   * the stricter answer and the one every other table here runs under, and the
   * connection role is unaffected. `down` already disables it. See the note in
   * docs/DATABASE-SETUP.md, "Row level security does not arrive on its own".
   */
  await db.execute(sql`ALTER TABLE "payload"."saved_listings" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."saved_listings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."saved_listings" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_saved_listings_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_saved_listings_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "saved_listings_id";`)
}
