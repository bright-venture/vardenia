import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The October 2026 list: six sections and sixteen kinds of place, with every
 * old value deleted from the database rather than retired.
 * See packages/core/src/taxonomy.
 *
 * # Why deleting was allowed this once
 *
 * The taxonomy's rule is to retire a slug, never delete it, because links and
 * printed codes point at categories. Before launch nothing did: no QR code
 * targets a category (all 1,625 in production target a listing or the home
 * page), and no reader holds a link. So the database is cleaned outright.
 *
 * # What it does, in one transaction
 *
 * 1. Every column typed by one of the seven enums becomes text, and the old
 *    types are dropped. Working in text sidesteps Postgres' rule that a value
 *    added to an enum cannot be used in the transaction that added it.
 * 2. Every listing AND every saved version is moved onto the new slugs:
 *
 *      hotels          <- luxury, boutique and apart hotels
 *      getaways        <- guest houses, villas, chalets, mountain/beach resorts
 *      restaurants     <- fine dining, traditional Lebanese
 *      cafes           <- coffee shops
 *      pools           <- beach clubs
 *      nightlife       <- sunset lounges
 *      historic-sites  <- historical sites
 *      guided-tours    <- tour guides
 *      activities      <- adventure, eco, rural, seasonal, mountain escapes,
 *                         hidden villages, wineries
 *      event-planners  <- wedding planners
 *      malls           <- luxury shopping
 *      gyms            <- wellness
 *      private-drivers <- private chauffeurs, luxury transportation
 *
 *    Anything else (wedding venues, hospitals, jewellery...) had nothing filed
 *    under it in either database; a stray row would be removed rather than block
 *    the migration. A listing left holding the same new slug twice keeps one.
 * 3. Healthcare goes: the gyms that were once filed there are Lifestyle, and an
 *    article or QR code aimed at it would lose the category. Wineries, now
 *    Activities, move from Eat & Drink to Experiences.
 * 4. The seven types are created again with only the new values, and every
 *    column is cast back.
 *
 * It is written to run on a database in either state: production, untouched,
 * and the dev database, which had the four new values added by hand while a
 * retire-only version of this change was being tried.
 */

const NEW_KINDS = sql`('hotels', 'getaways', 'restaurants', 'cafes', 'pools', 'nightlife', 'historic-sites', 'guided-tours', 'festivals', 'activities', 'event-planners', 'malls', 'gyms', 'car-rental', 'airport-transfers', 'private-drivers')`

const RENAME = sql`
  CASE "value"
    WHEN 'luxury-hotels' THEN 'hotels'
    WHEN 'boutique-hotels' THEN 'hotels'
    WHEN 'apart-hotels' THEN 'hotels'
    WHEN 'mountain-resorts' THEN 'getaways'
    WHEN 'beach-resorts' THEN 'getaways'
    WHEN 'guest-houses' THEN 'getaways'
    WHEN 'luxury-chalets' THEN 'getaways'
    WHEN 'private-villas' THEN 'getaways'
    WHEN 'fine-dining' THEN 'restaurants'
    WHEN 'lebanese-cuisine' THEN 'restaurants'
    WHEN 'coffee-shops' THEN 'cafes'
    WHEN 'beach-clubs' THEN 'pools'
    WHEN 'sunset-lounges' THEN 'nightlife'
    WHEN 'historical-sites' THEN 'historic-sites'
    WHEN 'tour-guides' THEN 'guided-tours'
    WHEN 'wine-experiences' THEN 'activities'
    WHEN 'rural-tourism' THEN 'activities'
    WHEN 'eco-tourism' THEN 'activities'
    WHEN 'summer-destinations' THEN 'activities'
    WHEN 'winter-destinations' THEN 'activities'
    WHEN 'mountain-escapes' THEN 'activities'
    WHEN 'hidden-villages' THEN 'activities'
    WHEN 'adventure' THEN 'activities'
    WHEN 'wedding-planners' THEN 'event-planners'
    WHEN 'luxury-shopping' THEN 'malls'
    WHEN 'wellness' THEN 'gyms'
    WHEN 'private-chauffeurs' THEN 'private-drivers'
    WHEN 'luxury-transportation' THEN 'private-drivers'
    ELSE "value"
  END`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  ALTER TABLE "payload"."businesses" ALTER COLUMN "category" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_category" SET DATA TYPE text;
  ALTER TABLE "payload"."articles" ALTER COLUMN "category" SET DATA TYPE text;
  ALTER TABLE "payload"."_articles_v" ALTER COLUMN "version_category" SET DATA TYPE text;
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "payload"."enum_businesses_subcategories";
  DROP TYPE "payload"."enum__businesses_v_version_subcategories";
  DROP TYPE "payload"."enum_businesses_category";
  DROP TYPE "payload"."enum__businesses_v_version_category";
  DROP TYPE "payload"."enum_articles_category";
  DROP TYPE "payload"."enum__articles_v_version_category";
  DROP TYPE "payload"."enum_qr_codes_category";

  UPDATE "payload"."businesses_subcategories" SET "value" = ${RENAME};
  UPDATE "payload"."_businesses_v_version_subcategories" SET "value" = ${RENAME};
  DELETE FROM "payload"."businesses_subcategories" WHERE "value" NOT IN ${NEW_KINDS};
  DELETE FROM "payload"."_businesses_v_version_subcategories" WHERE "value" NOT IN ${NEW_KINDS};
  DELETE FROM "payload"."businesses_subcategories" a
   USING "payload"."businesses_subcategories" b
   WHERE a."parent_id" = b."parent_id" AND a."value" = b."value" AND a."id" > b."id";
  DELETE FROM "payload"."_businesses_v_version_subcategories" a
   USING "payload"."_businesses_v_version_subcategories" b
   WHERE a."parent_id" = b."parent_id" AND a."value" = b."value" AND a."id" > b."id";

  UPDATE "payload"."businesses" SET "category" = 'lifestyle' WHERE "category" = 'healthcare';
  UPDATE "payload"."_businesses_v" SET "version_category" = 'lifestyle' WHERE "version_category" = 'healthcare';
  UPDATE "payload"."articles" SET "category" = NULL WHERE "category" = 'healthcare';
  UPDATE "payload"."_articles_v" SET "version_category" = NULL WHERE "version_category" = 'healthcare';
  UPDATE "payload"."qr_codes" SET "category" = NULL WHERE "category" = 'healthcare';

  UPDATE "payload"."businesses" b SET "category" = 'tourism'
   WHERE "category" = 'food-and-beverage'
     AND EXISTS (SELECT 1 FROM "payload"."businesses_subcategories" s
                  WHERE s."parent_id" = b."id" AND s."value" = 'activities')
     AND NOT EXISTS (SELECT 1 FROM "payload"."businesses_subcategories" s
                  WHERE s."parent_id" = b."id" AND s."value" <> 'activities');
  UPDATE "payload"."_businesses_v" v SET "version_category" = 'tourism'
   WHERE "version_category" = 'food-and-beverage'
     AND EXISTS (SELECT 1 FROM "payload"."_businesses_v_version_subcategories" s
                  WHERE s."parent_id" = v."id" AND s."value" = 'activities')
     AND NOT EXISTS (SELECT 1 FROM "payload"."_businesses_v_version_subcategories" s
                  WHERE s."parent_id" = v."id" AND s."value" <> 'activities');

  CREATE TYPE "payload"."enum_businesses_subcategories" AS ENUM('hotels', 'getaways', 'restaurants', 'cafes', 'pools', 'nightlife', 'historic-sites', 'guided-tours', 'festivals', 'activities', 'event-planners', 'malls', 'gyms', 'car-rental', 'airport-transfers', 'private-drivers');
  CREATE TYPE "payload"."enum__businesses_v_version_subcategories" AS ENUM('hotels', 'getaways', 'restaurants', 'cafes', 'pools', 'nightlife', 'historic-sites', 'guided-tours', 'festivals', 'activities', 'event-planners', 'malls', 'gyms', 'car-rental', 'airport-transfers', 'private-drivers');
  CREATE TYPE "payload"."enum_businesses_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'transportation');
  CREATE TYPE "payload"."enum__businesses_v_version_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'transportation');
  CREATE TYPE "payload"."enum_articles_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'transportation');
  CREATE TYPE "payload"."enum__articles_v_version_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'transportation');
  CREATE TYPE "payload"."enum_qr_codes_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'transportation');

  ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_businesses_subcategories" USING "value"::"payload"."enum_businesses_subcategories";
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum__businesses_v_version_subcategories" USING "value"::"payload"."enum__businesses_v_version_subcategories";
  ALTER TABLE "payload"."businesses" ALTER COLUMN "category" SET DATA TYPE "payload"."enum_businesses_category" USING "category"::"payload"."enum_businesses_category";
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_category" SET DATA TYPE "payload"."enum__businesses_v_version_category" USING "version_category"::"payload"."enum__businesses_v_version_category";
  ALTER TABLE "payload"."articles" ALTER COLUMN "category" SET DATA TYPE "payload"."enum_articles_category" USING "category"::"payload"."enum_articles_category";
  ALTER TABLE "payload"."_articles_v" ALTER COLUMN "version_category" SET DATA TYPE "payload"."enum__articles_v_version_category" USING "version_category"::"payload"."enum__articles_v_version_category";
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "category" SET DATA TYPE "payload"."enum_qr_codes_category" USING "category"::"payload"."enum_qr_codes_category";`)
}

/**
 * Puts the old types back, with each new slug mapped to the old one most of
 * its listings came from. Lossy and cannot be otherwise: a boutique and a
 * luxury hotel are both Hotels now, and both come back as luxury hotels.
 */
const RESTORE = sql`
  CASE "value"
    WHEN 'hotels' THEN 'luxury-hotels'
    WHEN 'getaways' THEN 'guest-houses'
    WHEN 'cafes' THEN 'coffee-shops'
    WHEN 'pools' THEN 'beach-clubs'
    WHEN 'historic-sites' THEN 'historical-sites'
    WHEN 'guided-tours' THEN 'tour-guides'
    WHEN 'activities' THEN 'adventure'
    WHEN 'event-planners' THEN 'wedding-planners'
    WHEN 'private-drivers' THEN 'private-chauffeurs'
    ELSE "value"
  END`

const OLD_KINDS = sql`('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'tour-guides', 'festivals', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'malls', 'gyms', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation')`

const OLD_CATEGORIES = sql`('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'healthcare', 'transportation')`

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE text;
  ALTER TABLE "payload"."businesses" ALTER COLUMN "category" SET DATA TYPE text;
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_category" SET DATA TYPE text;
  ALTER TABLE "payload"."articles" ALTER COLUMN "category" SET DATA TYPE text;
  ALTER TABLE "payload"."_articles_v" ALTER COLUMN "version_category" SET DATA TYPE text;
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "payload"."enum_businesses_subcategories";
  DROP TYPE "payload"."enum__businesses_v_version_subcategories";
  DROP TYPE "payload"."enum_businesses_category";
  DROP TYPE "payload"."enum__businesses_v_version_category";
  DROP TYPE "payload"."enum_articles_category";
  DROP TYPE "payload"."enum__articles_v_version_category";
  DROP TYPE "payload"."enum_qr_codes_category";

  UPDATE "payload"."businesses_subcategories" SET "value" = ${RESTORE};
  UPDATE "payload"."_businesses_v_version_subcategories" SET "value" = ${RESTORE};

  CREATE TYPE "payload"."enum_businesses_subcategories" AS ENUM${OLD_KINDS};
  CREATE TYPE "payload"."enum__businesses_v_version_subcategories" AS ENUM${OLD_KINDS};
  CREATE TYPE "payload"."enum_businesses_category" AS ENUM${OLD_CATEGORIES};
  CREATE TYPE "payload"."enum__businesses_v_version_category" AS ENUM${OLD_CATEGORIES};
  CREATE TYPE "payload"."enum_articles_category" AS ENUM${OLD_CATEGORIES};
  CREATE TYPE "payload"."enum__articles_v_version_category" AS ENUM${OLD_CATEGORIES};
  CREATE TYPE "payload"."enum_qr_codes_category" AS ENUM${OLD_CATEGORIES};

  ALTER TABLE "payload"."businesses_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_businesses_subcategories" USING "value"::"payload"."enum_businesses_subcategories";
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ALTER COLUMN "value" SET DATA TYPE "payload"."enum__businesses_v_version_subcategories" USING "value"::"payload"."enum__businesses_v_version_subcategories";
  ALTER TABLE "payload"."businesses" ALTER COLUMN "category" SET DATA TYPE "payload"."enum_businesses_category" USING "category"::"payload"."enum_businesses_category";
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "version_category" SET DATA TYPE "payload"."enum__businesses_v_version_category" USING "version_category"::"payload"."enum__businesses_v_version_category";
  ALTER TABLE "payload"."articles" ALTER COLUMN "category" SET DATA TYPE "payload"."enum_articles_category" USING "category"::"payload"."enum_articles_category";
  ALTER TABLE "payload"."_articles_v" ALTER COLUMN "version_category" SET DATA TYPE "payload"."enum__articles_v_version_category" USING "version_category"::"payload"."enum__articles_v_version_category";
  ALTER TABLE "payload"."qr_codes" ALTER COLUMN "category" SET DATA TYPE "payload"."enum_qr_codes_category" USING "category"::"payload"."enum_qr_codes_category";`)
}
