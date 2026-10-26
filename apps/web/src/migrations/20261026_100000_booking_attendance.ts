import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Did the guest come (Bookings: guestAnswer, guestAnsweredAt,
 * attendanceAskedAt, attendanceVerdict). See core/attendance.
 *
 * Additive: four nullable columns and two enums. Every existing booking reads
 * as "not asked, not answered, no decision", which is what it is.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_bookings_guest_answer" AS ENUM('came', 'did-not-come');
  CREATE TYPE "payload"."enum_bookings_attendance_verdict" AS ENUM('guest', 'venue');
  ALTER TABLE "payload"."bookings" ADD COLUMN "guest_answer" "payload"."enum_bookings_guest_answer";
  ALTER TABLE "payload"."bookings" ADD COLUMN "guest_answered_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."bookings" ADD COLUMN "attendance_asked_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."bookings" ADD COLUMN "attendance_verdict" "payload"."enum_bookings_attendance_verdict";
  CREATE INDEX "bookings_guest_answer_idx" ON "payload"."bookings" USING btree ("guest_answer");
  CREATE INDEX "bookings_attendance_asked_at_idx" ON "payload"."bookings" USING btree ("attendance_asked_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."bookings_guest_answer_idx";
  DROP INDEX "payload"."bookings_attendance_asked_at_idx";
  ALTER TABLE "payload"."bookings" DROP COLUMN "guest_answer";
  ALTER TABLE "payload"."bookings" DROP COLUMN "guest_answered_at";
  ALTER TABLE "payload"."bookings" DROP COLUMN "attendance_asked_at";
  ALTER TABLE "payload"."bookings" DROP COLUMN "attendance_verdict";
  DROP TYPE "payload"."enum_bookings_guest_answer";
  DROP TYPE "payload"."enum_bookings_attendance_verdict";`)
}
