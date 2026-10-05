import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Moves every listing onto the October 2026 list. See packages/core/src/taxonomy,
 * whose `SUBCATEGORY_MOVES` is the same table; this keeps its own copy because
 * a migration has to mean the same thing forever.
 *
 * # What moves where
 *
 *   Hotels      <- luxury, boutique and apart hotels
 *   Getaways    <- guest houses, villas, chalets, mountain and beach resorts
 *   Restaurants <- fine dining, traditional Lebanese
 *   Nightlife   <- sunset lounges
 *   Pools       <- beach clubs (the day pool resorts the Chouf file called Pools)
 *   Activities  <- adventure, eco, rural, seasonal, mountain escapes, hidden
 *                  villages, and wineries
 *   Malls       <- luxury shopping   (left over from September, see below)
 *   Gyms        <- wellness          (likewise)
 *   Private drivers <- luxury transportation
 *
 * Production at the time of writing: 1,624 published listings, all of which
 * land on a live kind of place. Nothing was filed under the weddings, lifestyle
 * or healthcare kinds that were retired without a successor.
 *
 * # Two listings' sections change
 *
 * Wineries were Eat & Drink and become Activities, which is Experiences, so
 * their category moves with them. A listing whose kinds of place all sit in one
 * other section is moved to that section; nothing in production has more than
 * one kind of place, so no listing is split.
 *
 * # The latest version moves too, older ones do not
 *
 * The September migration rewrote only the live rows, and the admin reads a
 * listing from its latest version - so 57 gyms and malls have been opening in
 * the editor as "Healthcare > Wellness" and "Lifestyle > Luxury Shopping" ever
 * since. This one rewrites the latest version alongside the live row, which
 * also mends those. Older versions are left as the record of what was saved at
 * the time.
 *
 * A listing filed under two old kinds that now mean the same thing (a boutique
 * and a luxury hotel) would hold Hotels twice; the duplicate is removed.
 */

const MOVES = sql`
  CASE "value"::text
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
    WHEN 'sunset-lounges' THEN 'nightlife'
    WHEN 'beach-clubs' THEN 'pools'
    WHEN 'wine-experiences' THEN 'activities'
    WHEN 'rural-tourism' THEN 'activities'
    WHEN 'eco-tourism' THEN 'activities'
    WHEN 'summer-destinations' THEN 'activities'
    WHEN 'winter-destinations' THEN 'activities'
    WHEN 'mountain-escapes' THEN 'activities'
    WHEN 'hidden-villages' THEN 'activities'
    WHEN 'adventure' THEN 'activities'
    WHEN 'luxury-shopping' THEN 'malls'
    WHEN 'wellness' THEN 'gyms'
    WHEN 'luxury-transportation' THEN 'private-chauffeurs'
    ELSE "value"::text
  END`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "payload"."businesses_subcategories"
       SET "value" = (${MOVES})::"payload"."enum_businesses_subcategories";

    UPDATE "payload"."_businesses_v_version_subcategories" s
       SET "value" = (${MOVES})::"payload"."enum__businesses_v_version_subcategories"
      FROM "payload"."_businesses_v" v
     WHERE v."id" = s."parent_id" AND v."latest" = true;

    DELETE FROM "payload"."businesses_subcategories" a
     USING "payload"."businesses_subcategories" b
     WHERE a."parent_id" = b."parent_id" AND a."value" = b."value" AND a."id" > b."id";

    DELETE FROM "payload"."_businesses_v_version_subcategories" a
     USING "payload"."_businesses_v_version_subcategories" b, "payload"."_businesses_v" v
     WHERE a."parent_id" = b."parent_id" AND a."value" = b."value" AND a."id" > b."id"
       AND v."id" = a."parent_id" AND v."latest" = true;

    UPDATE "payload"."businesses" b
       SET "category" = 'tourism'
     WHERE "category" = 'food-and-beverage'
       AND EXISTS (SELECT 1 FROM "payload"."businesses_subcategories" s
                    WHERE s."parent_id" = b."id" AND s."value" = 'activities')
       AND NOT EXISTS (SELECT 1 FROM "payload"."businesses_subcategories" s
                    WHERE s."parent_id" = b."id" AND s."value" <> 'activities');

    UPDATE "payload"."_businesses_v" v
       SET "version_category" = 'tourism'
     WHERE v."latest" = true AND v."version_category" = 'food-and-beverage'
       AND EXISTS (SELECT 1 FROM "payload"."_businesses_v_version_subcategories" s
                    WHERE s."parent_id" = v."id" AND s."value" = 'activities')
       AND NOT EXISTS (SELECT 1 FROM "payload"."_businesses_v_version_subcategories" s
                    WHERE s."parent_id" = v."id" AND s."value" <> 'activities');

    UPDATE "payload"."businesses" b
       SET "category" = 'lifestyle'
     WHERE "category" = 'healthcare'
       AND EXISTS (SELECT 1 FROM "payload"."businesses_subcategories" s
                    WHERE s."parent_id" = b."id" AND s."value" IN ('gyms', 'malls'));

    UPDATE "payload"."_businesses_v" v
       SET "version_category" = 'lifestyle'
     WHERE v."latest" = true AND v."version_category" = 'healthcare'
       AND EXISTS (SELECT 1 FROM "payload"."_businesses_v_version_subcategories" s
                    WHERE s."parent_id" = v."id" AND s."value" IN ('gyms', 'malls'));
  `)
}

/**
 * Lossy, and cannot be otherwise: a hotel that was boutique and one that was
 * luxury are both Hotels now. Each new value goes back to the old slug most of
 * its listings came from, which is enough for the previous migration's `down`
 * to rebuild the enum. Wineries stay in Experiences under `adventure`.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "payload"."businesses_subcategories"
       SET "value" = (CASE "value"::text
         WHEN 'hotels' THEN 'luxury-hotels'
         WHEN 'getaways' THEN 'guest-houses'
         WHEN 'pools' THEN 'beach-clubs'
         WHEN 'activities' THEN 'adventure'
         ELSE "value"::text END)::"payload"."enum_businesses_subcategories";

    UPDATE "payload"."_businesses_v_version_subcategories"
       SET "value" = (CASE "value"::text
         WHEN 'hotels' THEN 'luxury-hotels'
         WHEN 'getaways' THEN 'guest-houses'
         WHEN 'pools' THEN 'beach-clubs'
         WHEN 'activities' THEN 'adventure'
         ELSE "value"::text END)::"payload"."enum__businesses_v_version_subcategories";
  `)
}
