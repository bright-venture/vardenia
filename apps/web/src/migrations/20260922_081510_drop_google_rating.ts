import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."businesses_google_rating_idx";
  DROP INDEX "payload"."_businesses_v_version_version_google_rating_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN "google_rating";
  ALTER TABLE "payload"."businesses" DROP COLUMN "google_rating_count";
  ALTER TABLE "payload"."businesses" DROP COLUMN "rating_checked_at";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_google_rating";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_google_rating_count";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_rating_checked_at";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses" ADD COLUMN "google_rating" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "google_rating_count" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "rating_checked_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_google_rating" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_google_rating_count" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_rating_checked_at" timestamp(3) with time zone;
  CREATE INDEX "businesses_google_rating_idx" ON "payload"."businesses" USING btree ("google_rating");
  CREATE INDEX "_businesses_v_version_version_google_rating_idx" ON "payload"."_businesses_v" USING btree ("version_google_rating");`)
}
