import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The receipt number read from a photo, so one receipt counts once.
 *
 * Asked for on 6 November 2026: a second receipt with the same number at the
 * same place is refused (lib/receipts isRepeatedReceipt). This adds the column
 * that number is kept in, the index that lookup uses, and the "number" concern
 * for a receipt whose number could not be read. All additive: existing
 * receipts keep an empty number and are not checked against.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_receipts_reading_concerns" ADD VALUE 'number';
  ALTER TABLE "payload"."receipts" ADD COLUMN "reading_number" varchar;
  CREATE INDEX "receipts_reading_reading_number_idx" ON "payload"."receipts" USING btree ("reading_number");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The "number" flags go first: the type cannot be narrowed while a row uses it.
  await db.execute(sql`
   DELETE FROM "payload"."receipts_reading_concerns" WHERE "value" = 'number';
  ALTER TABLE "payload"."receipts_reading_concerns" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_receipts_reading_concerns";
  CREATE TYPE "payload"."enum_receipts_reading_concerns" AS ENUM('amount', 'date', 'place', 'unreadable');
  ALTER TABLE "payload"."receipts_reading_concerns" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_receipts_reading_concerns" USING "value"::"payload"."enum_receipts_reading_concerns";
  DROP INDEX "payload"."receipts_reading_reading_number_idx";
  ALTER TABLE "payload"."receipts" DROP COLUMN "reading_number";`)
}
