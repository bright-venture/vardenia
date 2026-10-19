import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * QR codes printed on shirts (placement `t-shirt`) and where each shirt is
 * (QR codes `location`).
 *
 * Additive. `ADD VALUE` leaves every existing row and both column defaults
 * alone, and the new value is not used in this transaction, which is the one
 * thing Postgres refuses. Both placement enums gain it: a scan copies its code's
 * placement into the scan log, so a shirt scan would fail to log without the
 * second one. `location` is nullable and empty on every magazine code.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_qr_codes_placement" ADD VALUE IF NOT EXISTS 't-shirt';
  ALTER TYPE "payload"."enum_scan_events_placement" ADD VALUE IF NOT EXISTS 't-shirt';
  ALTER TABLE "payload"."qr_codes" ADD COLUMN IF NOT EXISTS "location" varchar;`)
}

/**
 * Postgres cannot drop one value from an enum, so the types are rebuilt. Shirt
 * codes and their scans are relabelled `magazine-page` first, because a row
 * still holding `t-shirt` cannot be cast to the rebuilt type. That relabelling
 * is the price of rolling back: the codes and their scans are kept, only the
 * word on them is lost.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."qr_codes" DROP COLUMN IF EXISTS "location";
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "placement" DROP DEFAULT;
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "placement" SET DATA TYPE text;
  ALTER TABLE "payload"."scan_events" ALTER COLUMN "placement" SET DATA TYPE text;
  UPDATE "payload"."qr_codes" SET "placement" = 'magazine-page' WHERE "placement" = 't-shirt';
  UPDATE "payload"."scan_events" SET "placement" = 'magazine-page' WHERE "placement" = 't-shirt';
  DROP TYPE "payload"."enum_qr_codes_placement";
  DROP TYPE "payload"."enum_scan_events_placement";
  CREATE TYPE "payload"."enum_qr_codes_placement" AS ENUM('magazine-page');
  CREATE TYPE "payload"."enum_scan_events_placement" AS ENUM('magazine-page');
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "placement" SET DATA TYPE "payload"."enum_qr_codes_placement" USING "placement"::"payload"."enum_qr_codes_placement";
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "placement" SET DEFAULT 'magazine-page';
  ALTER TABLE "payload"."scan_events" ALTER COLUMN "placement" SET DATA TYPE "payload"."enum_scan_events_placement" USING "placement"::"payload"."enum_scan_events_placement";`)
}
