import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Sample listings (26 November 2026). Every listing in production was mock data
 * on this date, so all existing rows are flagged `is_sample = true` and their
 * `listing_number` is cleared. No backup of the old numbers is kept, by the
 * owner's decision.
 *
 * The flagging sits inside the IF so it only runs when the column is just being
 * added. A second run therefore does nothing, and real listings created later
 * (is_sample = false) are never flagged.
 *
 * `down` only drops the column; the cleared numbers are not restored.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'payload' AND table_name = 'businesses' AND column_name = 'is_sample'
    ) THEN
      ALTER TABLE "payload"."businesses" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;
      UPDATE "payload"."businesses" SET "is_sample" = true, "listing_number" = NULL;
    END IF;
  END $$;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "is_sample";`)
}
