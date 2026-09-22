import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `malls` and `gyms` join the Lifestyle subcategories.
 *
 * Both had been filed under a near-enough neighbour by the importer: a shopping
 * centre under `luxury-shopping`, which describes a boutique, and a gym under
 * `healthcare/wellness`, which put fifty fitness clubs in the section that holds
 * hospitals. See packages/core/src/taxonomy.
 *
 * # Why this migration only adds the values
 *
 * Postgres will not let a value added by `ALTER TYPE ... ADD VALUE` be used in
 * the same transaction that added it, and Payload runs each migration in one.
 * So the rows that should carry these values are moved by the migration after
 * this one, which is the first transaction in which they exist.
 *
 * `IF NOT EXISTS` matches the locale-expansion migration: an enum value cannot
 * be dropped, so `down` rebuilds the type at its previous values, and a re-run
 * of `up` has to be harmless.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_businesses_subcategories" ADD VALUE IF NOT EXISTS 'malls' BEFORE 'jewelry';
  ALTER TYPE "payload"."enum_businesses_subcategories" ADD VALUE IF NOT EXISTS 'gyms' BEFORE 'jewelry';
  ALTER TYPE "payload"."enum__businesses_v_version_subcategories" ADD VALUE IF NOT EXISTS 'malls' BEFORE 'jewelry';
  ALTER TYPE "payload"."enum__businesses_v_version_subcategories" ADD VALUE IF NOT EXISTS 'gyms' BEFORE 'jewelry';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_businesses_subcategories";
  CREATE TYPE "payload"."enum_businesses_subcategories" AS ENUM('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'tour-guides', 'festivals', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation');
  ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_businesses_subcategories" USING "value"::"payload"."enum_businesses_subcategories";
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum__businesses_v_version_subcategories";
  CREATE TYPE "payload"."enum__businesses_v_version_subcategories" AS ENUM('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'tour-guides', 'festivals', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation');
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum__businesses_v_version_subcategories" USING "value"::"payload"."enum__businesses_v_version_subcategories";`)
}
