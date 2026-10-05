import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The four new kinds of place in the October 2026 list: Hotels, Getaways,
 * Pools and Activities. See packages/core/src/taxonomy.
 *
 * Only the values are added here. Postgres will not let a value added by
 * `ALTER TYPE ... ADD VALUE` be used in the transaction that added it, and
 * Payload runs each migration in one, so the listings move in the migration
 * after this one - the same split as the gyms and malls in September.
 *
 * Each sits beside the slugs it replaces, which is also where the taxonomy
 * lists it, so the enum and the generated schema agree on the order.
 *
 * Nothing is removed. Every retired slug stays in the type: old versions of a
 * listing still hold them, and an enum value cannot be dropped while a row does.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "payload"."enum_businesses_subcategories" ADD VALUE IF NOT EXISTS 'hotels' BEFORE 'luxury-hotels';
  ALTER TYPE "payload"."enum_businesses_subcategories" ADD VALUE IF NOT EXISTS 'getaways' BEFORE 'luxury-hotels';
  ALTER TYPE "payload"."enum_businesses_subcategories" ADD VALUE IF NOT EXISTS 'pools' BEFORE 'beach-clubs';
  ALTER TYPE "payload"."enum_businesses_subcategories" ADD VALUE IF NOT EXISTS 'activities' AFTER 'festivals';
  ALTER TYPE "payload"."enum__businesses_v_version_subcategories" ADD VALUE IF NOT EXISTS 'hotels' BEFORE 'luxury-hotels';
  ALTER TYPE "payload"."enum__businesses_v_version_subcategories" ADD VALUE IF NOT EXISTS 'getaways' BEFORE 'luxury-hotels';
  ALTER TYPE "payload"."enum__businesses_v_version_subcategories" ADD VALUE IF NOT EXISTS 'pools' BEFORE 'beach-clubs';
  ALTER TYPE "payload"."enum__businesses_v_version_subcategories" ADD VALUE IF NOT EXISTS 'activities' AFTER 'festivals';`)
}

/**
 * Rebuilds both types at their previous values. Runs after the next
 * migration's `down`, which moves every listing off the four new values first;
 * a row still holding one would make the cast below fail, which is the right
 * outcome rather than a silent loss.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_businesses_subcategories";
  CREATE TYPE "payload"."enum_businesses_subcategories" AS ENUM('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'tour-guides', 'festivals', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'malls', 'gyms', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation');
  ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_businesses_subcategories" USING "value"::"payload"."enum_businesses_subcategories";
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum__businesses_v_version_subcategories";
  CREATE TYPE "payload"."enum__businesses_v_version_subcategories" AS ENUM('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'tour-guides', 'festivals', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'malls', 'gyms', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation');
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum__businesses_v_version_subcategories" USING "value"::"payload"."enum__businesses_v_version_subcategories";`)
}
