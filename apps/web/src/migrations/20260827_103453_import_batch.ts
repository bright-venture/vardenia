import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_businesses_subcategories" ADD VALUE 'tour-guides' BEFORE 'wedding-venues';
  ALTER TYPE "payload"."enum_businesses_subcategories" ADD VALUE 'festivals' BEFORE 'wedding-venues';
  ALTER TYPE "payload"."enum__businesses_v_version_subcategories" ADD VALUE 'tour-guides' BEFORE 'wedding-venues';
  ALTER TYPE "payload"."enum__businesses_v_version_subcategories" ADD VALUE 'festivals' BEFORE 'wedding-venues';
  ALTER TABLE "payload"."businesses" ADD COLUMN "import_batch" varchar;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_import_batch" varchar;
  CREATE INDEX "businesses_import_batch_idx" ON "payload"."businesses" USING btree ("import_batch");
  CREATE INDEX "_businesses_v_version_version_import_batch_idx" ON "payload"."_businesses_v" USING btree ("version_import_batch");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_businesses_subcategories";
  CREATE TYPE "payload"."enum_businesses_subcategories" AS ENUM('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation');
  ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_businesses_subcategories" USING "value"::"payload"."enum_businesses_subcategories";
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum__businesses_v_version_subcategories";
  CREATE TYPE "payload"."enum__businesses_v_version_subcategories" AS ENUM('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation');
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum__businesses_v_version_subcategories" USING "value"::"payload"."enum__businesses_v_version_subcategories";
  DROP INDEX "payload"."businesses_import_batch_idx";
  DROP INDEX "payload"."_businesses_v_version_version_import_batch_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN "import_batch";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_import_batch";`)
}
