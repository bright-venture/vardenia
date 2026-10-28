import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Commissions replace booking fees (see core/booking-fees).
 *
 * - The Commissions page: a global with the default rate, empty until an admin
 *   sets it, so nobody is billed by this migration.
 * - Listings: `commission.rate` and `commission.waivedUntil` replace the four
 *   booking-fee fields. A launch offer already agreed carries over; the old
 *   per-unit amounts do not, because a dollar amount is not a percentage.
 * - Bookings: what the guest spent, as the venue says and as the guest says.
 * - Statement lines: `base`, the amount spent, replaces `unit` and `quantity`;
 *   `rate` is now a percentage. No statement exists in production; in a dev
 *   database the old demo lines keep their numbers and read oddly until the
 *   billing demo is reset.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."commission_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"default_rate" numeric,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  ALTER TABLE "payload"."commission_settings" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."businesses" ADD COLUMN "commission_rate" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "commission_waived_until" timestamp(3) with time zone;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_commission_rate" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_commission_waived_until" timestamp(3) with time zone;
  UPDATE "payload"."businesses" SET "commission_waived_until" = "booking_fee_waived_until";
  UPDATE "payload"."_businesses_v" SET "version_commission_waived_until" = "version_booking_fee_waived_until";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_fee_unit";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_fee_amount";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_fee_cap";
  ALTER TABLE "payload"."businesses" DROP COLUMN "booking_fee_waived_until";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_booking_fee_unit";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_booking_fee_amount";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_booking_fee_cap";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_booking_fee_waived_until";
  ALTER TABLE "payload"."bookings" ADD COLUMN "amount" numeric;
  ALTER TABLE "payload"."bookings" ADD COLUMN "amount_entered_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."bookings" ADD COLUMN "guest_amount" numeric;
  ALTER TABLE "payload"."statements_lines" ADD COLUMN "base" numeric;
  ALTER TABLE "payload"."statements_lines" DROP COLUMN "unit";
  ALTER TABLE "payload"."statements_lines" DROP COLUMN "quantity";
  DROP TYPE "payload"."enum_businesses_booking_fee_unit";
  DROP TYPE "payload"."enum__businesses_v_version_booking_fee_unit";
  DROP TYPE "payload"."enum_statements_lines_unit";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_businesses_booking_fee_unit" AS ENUM('guest', 'night', 'booking');
  CREATE TYPE "payload"."enum__businesses_v_version_booking_fee_unit" AS ENUM('guest', 'night', 'booking');
  CREATE TYPE "payload"."enum_statements_lines_unit" AS ENUM('guest', 'night', 'booking');
  ALTER TABLE "payload"."statements_lines" ADD COLUMN "unit" "payload"."enum_statements_lines_unit";
  ALTER TABLE "payload"."statements_lines" ADD COLUMN "quantity" numeric;
  ALTER TABLE "payload"."statements_lines" DROP COLUMN "base";
  ALTER TABLE "payload"."bookings" DROP COLUMN "amount";
  ALTER TABLE "payload"."bookings" DROP COLUMN "amount_entered_at";
  ALTER TABLE "payload"."bookings" DROP COLUMN "guest_amount";
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_fee_unit" "payload"."enum_businesses_booking_fee_unit";
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_fee_amount" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_fee_cap" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "booking_fee_waived_until" timestamp(3) with time zone;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_fee_unit" "payload"."enum__businesses_v_version_booking_fee_unit";
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_fee_amount" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_fee_cap" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_booking_fee_waived_until" timestamp(3) with time zone;
  UPDATE "payload"."businesses" SET "booking_fee_waived_until" = "commission_waived_until";
  UPDATE "payload"."_businesses_v" SET "version_booking_fee_waived_until" = "version_commission_waived_until";
  ALTER TABLE "payload"."businesses" DROP COLUMN "commission_rate";
  ALTER TABLE "payload"."businesses" DROP COLUMN "commission_waived_until";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_commission_rate";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_commission_waived_until";
  DROP TABLE "payload"."commission_settings" CASCADE;`)
}
