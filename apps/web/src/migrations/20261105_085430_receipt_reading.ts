import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_receipts_reading_concerns" AS ENUM('amount', 'date', 'place', 'unreadable');
  CREATE TYPE "payload"."enum_receipts_reading_currency" AS ENUM('USD', 'LBP');
  CREATE TYPE "payload"."enum_receipts_reading_place" AS ENUM('yes', 'no', 'unclear');
  CREATE TABLE "payload"."receipts_reading_concerns" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_receipts_reading_concerns",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "payload"."receipts" ADD COLUMN "reading_total" numeric;
  ALTER TABLE "payload"."receipts" ADD COLUMN "reading_currency" "payload"."enum_receipts_reading_currency";
  ALTER TABLE "payload"."receipts" ADD COLUMN "reading_date" varchar;
  ALTER TABLE "payload"."receipts" ADD COLUMN "reading_place" "payload"."enum_receipts_reading_place";
  ALTER TABLE "payload"."receipts_reading_concerns" ADD CONSTRAINT "receipts_reading_concerns_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."receipts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "receipts_reading_concerns_order_idx" ON "payload"."receipts_reading_concerns" USING btree ("order");
  CREATE INDEX "receipts_reading_concerns_parent_idx" ON "payload"."receipts_reading_concerns" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."receipts_reading_concerns" CASCADE;
  ALTER TABLE "payload"."receipts" DROP COLUMN "reading_total";
  ALTER TABLE "payload"."receipts" DROP COLUMN "reading_currency";
  ALTER TABLE "payload"."receipts" DROP COLUMN "reading_date";
  ALTER TABLE "payload"."receipts" DROP COLUMN "reading_place";
  DROP TYPE "payload"."enum_receipts_reading_concerns";
  DROP TYPE "payload"."enum_receipts_reading_currency";
  DROP TYPE "payload"."enum_receipts_reading_place";`)
}
