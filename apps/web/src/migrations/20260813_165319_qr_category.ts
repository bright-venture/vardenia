import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_qr_codes_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'healthcare', 'transportation');
  ALTER TABLE "payload"."qr_codes" ADD COLUMN "category" "payload"."enum_qr_codes_category";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."qr_codes" DROP COLUMN "category";
  DROP TYPE "payload"."enum_qr_codes_category";`)
}
