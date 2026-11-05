import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Receipt amount first (core/billableAmount): the booking keeps its receipt's
 * total in dollars, a statement line says whose figure it was billed on, and
 * the Commissions page holds the rate for receipts in pounds.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_statements_lines_base_from" AS ENUM('receipt', 'venue', 'guest');
  ALTER TABLE "payload"."bookings" ADD COLUMN "receipt_amount" numeric;
  ALTER TABLE "payload"."statements_lines" ADD COLUMN "base_from" "payload"."enum_statements_lines_base_from";
  ALTER TABLE "payload"."commission_settings" ADD COLUMN "pounds_per_dollar" numeric;`)

  // Receipts already linked, in dollars, take effect at once. Those in pounds
  // wait for a rate on the Commissions page and a correction of the receipt.
  await db.execute(sql`
   UPDATE "payload"."bookings" AS b
      SET "receipt_amount" = round(r."amount", 2)
     FROM "payload"."receipts" AS r
    WHERE b."receipt_id" = r."id" AND r."currency" = 'USD' AND r."amount" > 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."bookings" DROP COLUMN "receipt_amount";
  ALTER TABLE "payload"."statements_lines" DROP COLUMN "base_from";
  ALTER TABLE "payload"."commission_settings" DROP COLUMN "pounds_per_dollar";
  DROP TYPE "payload"."enum_statements_lines_base_from";`)
}
