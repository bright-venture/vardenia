import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The closures table, and one column on bookings.
 *
 * `closures` holds the days a venue is shut - the first table a partner writes
 * to directly. `bookings.decline_reason` is the line a venue can send with a
 * refusal, so a decline reads as "we are closed that week" rather than as a door
 * shutting.
 *
 * # The row level security line is hand added, and has to be
 *
 * Everything above it came from `migrate:create`. The `ENABLE ROW LEVEL
 * SECURITY` did not, and it is not an oversight in the generator: Postgres has
 * no default for RLS, so a table created after 20260826_140000_row_level_security
 * arrives without it and nothing notices. That migration says so in as many
 * words, and this is the first new collection since.
 *
 * Only production keeps it. Development runs drizzle push on every boot, which
 * reconciles the schema against the collection definitions and resets RLS along
 * the way. Measured there, not assumed.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."closures" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" integer NOT NULL,
  	"starts_on" varchar NOT NULL,
  	"ends_on" varchar NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."bookings" ADD COLUMN "decline_reason" varchar;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "closures_id" integer;
  ALTER TABLE "payload"."closures" ADD CONSTRAINT "closures_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "closures_business_idx" ON "payload"."closures" USING btree ("business_id");
  CREATE INDEX "closures_starts_on_idx" ON "payload"."closures" USING btree ("starts_on");
  CREATE INDEX "closures_ends_on_idx" ON "payload"."closures" USING btree ("ends_on");
  CREATE INDEX "closures_updated_at_idx" ON "payload"."closures" USING btree ("updated_at");
  CREATE INDEX "closures_created_at_idx" ON "payload"."closures" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_closures_fk" FOREIGN KEY ("closures_id") REFERENCES "payload"."closures"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_closures_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("closures_id");`)

  // See the note above. Not generated, and not optional.
  await db.execute(sql`ALTER TABLE "payload"."closures" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."closures" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."closures" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_closures_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_closures_id_idx";
  ALTER TABLE "payload"."bookings" DROP COLUMN "decline_reason";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "closures_id";`)
}
