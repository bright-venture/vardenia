import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A booking can be made in any of the site's ten languages.
 *
 * The `locale` column's enum held `en` and `ar`, from when those were the only
 * two. The site then gained eight more, and a booking made in one of them was
 * refused - first by the request schema in @vardenia/core, which is fixed in the
 * same change, and behind that by this enum. The column records the language
 * every later email about the booking is written in, so it has to be able to
 * hold the one the customer booked in.
 *
 * # Only adding values
 *
 * `IF NOT EXISTS`, as in the earlier enum migrations here: an enum value cannot
 * be dropped, so a re-run of `up` has to be harmless, and the dev database will
 * already have these from its own schema push.
 *
 * # `down` rewrites before it narrows
 *
 * The generated `down` recreated the enum as `('en', 'ar')` and cast the column
 * straight back, which fails on the first booking made in French - the same
 * trap 20260922_110157_two_tiers fell into. So the bookings in a retired
 * language are rewritten to English while the column is plain text, and only
 * then is the narrower type put back. Lossy, and unavoidably so: rolling back
 * restores the column's shape, not the language each customer chose.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_bookings_locale" ADD VALUE IF NOT EXISTS 'fr';
  ALTER TYPE "payload"."enum_bookings_locale" ADD VALUE IF NOT EXISTS 'es';
  ALTER TYPE "payload"."enum_bookings_locale" ADD VALUE IF NOT EXISTS 'pt';
  ALTER TYPE "payload"."enum_bookings_locale" ADD VALUE IF NOT EXISTS 'ru';
  ALTER TYPE "payload"."enum_bookings_locale" ADD VALUE IF NOT EXISTS 'zh';
  ALTER TYPE "payload"."enum_bookings_locale" ADD VALUE IF NOT EXISTS 'hi';
  ALTER TYPE "payload"."enum_bookings_locale" ADD VALUE IF NOT EXISTS 'bn';
  ALTER TYPE "payload"."enum_bookings_locale" ADD VALUE IF NOT EXISTS 'ur';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."bookings" ALTER COLUMN "locale" SET DATA TYPE text;
  ALTER TABLE "payload"."bookings" ALTER COLUMN "locale" SET DEFAULT 'en'::text;
  UPDATE "payload"."bookings" SET "locale" = 'en' WHERE "locale" NOT IN ('en', 'ar');
  DROP TYPE "payload"."enum_bookings_locale";
  CREATE TYPE "payload"."enum_bookings_locale" AS ENUM('en', 'ar');
  ALTER TABLE "payload"."bookings" ALTER COLUMN "locale" SET DEFAULT 'en'::"payload"."enum_bookings_locale";
  ALTER TABLE "payload"."bookings" ALTER COLUMN "locale" SET DATA TYPE "payload"."enum_bookings_locale" USING "locale"::"payload"."enum_bookings_locale";`)
}
