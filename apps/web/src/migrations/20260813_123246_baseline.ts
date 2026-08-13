import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Added by hand, and it must stay.
  //
  // Every statement below is qualified with "payload"., but nothing in the
  // generated migration creates that schema. Payload only issues CREATE SCHEMA
  // from `createDatabase`, which runs when it builds a whole new database - and
  // it cannot do that on Supabase, where the database already exists and the
  // schema was created by hand in the SQL editor.
  //
  // Without this line the first CREATE TABLE on a fresh production database
  // fails with "schema payload does not exist", and the deploy dies on its very
  // first migration. Regenerating this file will drop the line; put it back.
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "payload";`)

  await db.execute(sql`
   CREATE TYPE "payload"."_locales" AS ENUM('en', 'ar');
  CREATE TYPE "payload"."enum_businesses_amenities" AS ENUM('sea-view', 'mountain-view', 'pool', 'spa', 'valet-parking', 'free-parking', 'accessible', 'family-friendly', 'pet-friendly', 'outdoor-seating', 'live-music', 'alcohol', 'halal', 'vegetarian', 'wifi', 'air-conditioning');
  CREATE TYPE "payload"."enum_businesses_subcategories" AS ENUM('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation');
  CREATE TYPE "payload"."enum_businesses_opening_hours_day" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  CREATE TYPE "payload"."enum_businesses_seasonality" AS ENUM('year-round', 'summer', 'winter');
  CREATE TYPE "payload"."enum_businesses_price_range" AS ENUM('1', '2', '3', '4');
  CREATE TYPE "payload"."enum_businesses_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'healthcare', 'transportation');
  CREATE TYPE "payload"."enum_businesses_governorate" AS ENUM('beirut', 'mount-lebanon', 'north-lebanon', 'akkar', 'beqaa', 'baalbek-hermel', 'south-lebanon', 'nabatieh');
  CREATE TYPE "payload"."enum_businesses_district" AS ENUM('beirut', 'aley', 'baabda', 'chouf', 'jbeil', 'keserwan', 'matn', 'batroun', 'bsharri', 'koura', 'miniyeh-danniyeh', 'tripoli', 'zgharta', 'akkar', 'rachaya', 'western-beqaa', 'zahle', 'baalbek', 'hermel', 'jezzine', 'sidon', 'tyre', 'bint-jbeil', 'hasbaya', 'marjeyoun', 'nabatieh');
  CREATE TYPE "payload"."enum_businesses_tier" AS ENUM('free', 'listed', 'featured', 'partner');
  CREATE TYPE "payload"."enum_businesses_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__businesses_v_version_amenities" AS ENUM('sea-view', 'mountain-view', 'pool', 'spa', 'valet-parking', 'free-parking', 'accessible', 'family-friendly', 'pet-friendly', 'outdoor-seating', 'live-music', 'alcohol', 'halal', 'vegetarian', 'wifi', 'air-conditioning');
  CREATE TYPE "payload"."enum__businesses_v_version_subcategories" AS ENUM('luxury-hotels', 'boutique-hotels', 'apart-hotels', 'mountain-resorts', 'beach-resorts', 'guest-houses', 'luxury-chalets', 'private-villas', 'restaurants', 'fine-dining', 'lebanese-cuisine', 'coffee-shops', 'sunset-lounges', 'beach-clubs', 'nightlife', 'wine-experiences', 'historical-sites', 'rural-tourism', 'eco-tourism', 'summer-destinations', 'winter-destinations', 'mountain-escapes', 'hidden-villages', 'adventure', 'wedding-venues', 'wedding-planners', 'photographers', 'catering', 'luxury-cars', 'flowers', 'bridal-fashion', 'formal-wear', 'beauty-salons', 'entertainment', 'luxury-shopping', 'jewelry', 'fashion', 'beauty', 'grooming', 'souvenirs', 'luxury-experiences', 'hospitals', 'medical-centers', 'pharmacies', 'medical-tourism', 'wellness', 'spa-centers', 'car-rental', 'airport-transfers', 'private-chauffeurs', 'luxury-transportation');
  CREATE TYPE "payload"."enum__businesses_v_version_opening_hours_day" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  CREATE TYPE "payload"."enum__businesses_v_version_seasonality" AS ENUM('year-round', 'summer', 'winter');
  CREATE TYPE "payload"."enum__businesses_v_version_price_range" AS ENUM('1', '2', '3', '4');
  CREATE TYPE "payload"."enum__businesses_v_version_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'healthcare', 'transportation');
  CREATE TYPE "payload"."enum__businesses_v_version_governorate" AS ENUM('beirut', 'mount-lebanon', 'north-lebanon', 'akkar', 'beqaa', 'baalbek-hermel', 'south-lebanon', 'nabatieh');
  CREATE TYPE "payload"."enum__businesses_v_version_district" AS ENUM('beirut', 'aley', 'baabda', 'chouf', 'jbeil', 'keserwan', 'matn', 'batroun', 'bsharri', 'koura', 'miniyeh-danniyeh', 'tripoli', 'zgharta', 'akkar', 'rachaya', 'western-beqaa', 'zahle', 'baalbek', 'hermel', 'jezzine', 'sidon', 'tyre', 'bint-jbeil', 'hasbaya', 'marjeyoun', 'nabatieh');
  CREATE TYPE "payload"."enum__businesses_v_version_tier" AS ENUM('free', 'listed', 'featured', 'partner');
  CREATE TYPE "payload"."enum__businesses_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__businesses_v_published_locale" AS ENUM('en', 'ar');
  CREATE TYPE "payload"."enum_qr_codes_target_type" AS ENUM('business', 'article', 'issue', 'category', 'external');
  CREATE TYPE "payload"."enum_qr_codes_placement" AS ENUM('magazine-page');
  CREATE TYPE "payload"."enum_articles_kind" AS ENUM('feature', 'guide', 'interview', 'itinerary', 'news', 'sponsored');
  CREATE TYPE "payload"."enum_articles_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'healthcare', 'transportation');
  CREATE TYPE "payload"."enum_articles_governorate" AS ENUM('beirut', 'mount-lebanon', 'north-lebanon', 'akkar', 'beqaa', 'baalbek-hermel', 'south-lebanon', 'nabatieh');
  CREATE TYPE "payload"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__articles_v_version_kind" AS ENUM('feature', 'guide', 'interview', 'itinerary', 'news', 'sponsored');
  CREATE TYPE "payload"."enum__articles_v_version_category" AS ENUM('hospitality', 'food-and-beverage', 'tourism', 'weddings', 'lifestyle', 'healthcare', 'transportation');
  CREATE TYPE "payload"."enum__articles_v_version_governorate" AS ENUM('beirut', 'mount-lebanon', 'north-lebanon', 'akkar', 'beqaa', 'baalbek-hermel', 'south-lebanon', 'nabatieh');
  CREATE TYPE "payload"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__articles_v_published_locale" AS ENUM('en', 'ar');
  CREATE TYPE "payload"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_published_locale" AS ENUM('en', 'ar');
  CREATE TYPE "payload"."enum_media_usage_rights" AS ENUM('owned', 'licensed', 'supplied');
  CREATE TYPE "payload"."enum_users_roles" AS ENUM('admin', 'staff');
  CREATE TYPE "payload"."enum_scan_events_placement" AS ENUM('magazine-page');
  CREATE TYPE "payload"."enum_scan_events_platform" AS ENUM('ios', 'android', 'web', 'unknown');
  CREATE TABLE "payload"."businesses_amenities" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_businesses_amenities",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."businesses_subcategories" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_businesses_subcategories",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."businesses_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"day" "payload"."enum_businesses_opening_hours_day",
  	"opens" varchar,
  	"closes" varchar,
  	"closed" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."businesses_seasonality" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_businesses_seasonality",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."businesses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"hero_image_id" integer,
  	"logo_id" integer,
  	"price_range" "payload"."enum_businesses_price_range",
  	"category" "payload"."enum_businesses_category",
  	"governorate" "payload"."enum_businesses_governorate",
  	"district" "payload"."enum_businesses_district",
  	"location" geometry(Point),
  	"phone" varchar,
  	"whatsapp" varchar,
  	"email" varchar,
  	"website" varchar,
  	"reservation_url" varchar,
  	"menu_url" varchar,
  	"socials_instagram" varchar,
  	"socials_facebook" varchar,
  	"socials_tiktok" varchar,
  	"socials_linkedin" varchar,
  	"socials_youtube" varchar,
  	"tier" "payload"."enum_businesses_tier" DEFAULT 'free',
  	"verified" boolean DEFAULT false,
  	"contract_starts_at" timestamp(3) with time zone,
  	"contract_ends_at" timestamp(3) with time zone,
  	"sales_owner_id" integer,
  	"internal_notes" varchar,
  	"qr_code_id" integer,
  	"seo_image_id" integer,
  	"seo_no_index" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_businesses_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."businesses_locales" (
  	"name" varchar,
  	"tagline" varchar,
  	"description" jsonb,
  	"address" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."businesses_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "payload"."businesses_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "payload"."_businesses_v_version_amenities" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__businesses_v_version_amenities",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_businesses_v_version_subcategories" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__businesses_v_version_subcategories",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_businesses_v_version_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" "payload"."enum__businesses_v_version_opening_hours_day",
  	"opens" varchar,
  	"closes" varchar,
  	"closed" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_businesses_v_version_seasonality" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__businesses_v_version_seasonality",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_businesses_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_hero_image_id" integer,
  	"version_logo_id" integer,
  	"version_price_range" "payload"."enum__businesses_v_version_price_range",
  	"version_category" "payload"."enum__businesses_v_version_category",
  	"version_governorate" "payload"."enum__businesses_v_version_governorate",
  	"version_district" "payload"."enum__businesses_v_version_district",
  	"version_location" geometry(Point),
  	"version_phone" varchar,
  	"version_whatsapp" varchar,
  	"version_email" varchar,
  	"version_website" varchar,
  	"version_reservation_url" varchar,
  	"version_menu_url" varchar,
  	"version_socials_instagram" varchar,
  	"version_socials_facebook" varchar,
  	"version_socials_tiktok" varchar,
  	"version_socials_linkedin" varchar,
  	"version_socials_youtube" varchar,
  	"version_tier" "payload"."enum__businesses_v_version_tier" DEFAULT 'free',
  	"version_verified" boolean DEFAULT false,
  	"version_contract_starts_at" timestamp(3) with time zone,
  	"version_contract_ends_at" timestamp(3) with time zone,
  	"version_sales_owner_id" integer,
  	"version_internal_notes" varchar,
  	"version_qr_code_id" integer,
  	"version_seo_image_id" integer,
  	"version_seo_no_index" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__businesses_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__businesses_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "payload"."_businesses_v_locales" (
  	"version_name" varchar,
  	"version_tagline" varchar,
  	"version_description" jsonb,
  	"version_address" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_businesses_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "payload"."_businesses_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "payload"."qr_codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"target_type" "payload"."enum_qr_codes_target_type" DEFAULT 'business' NOT NULL,
  	"business_id" integer,
  	"article_id" integer,
  	"external_url" varchar,
  	"placement" "payload"."enum_qr_codes_placement" DEFAULT 'magazine-page' NOT NULL,
  	"issue_id" integer,
  	"active" boolean DEFAULT true,
  	"scan_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"kind" "payload"."enum_articles_kind" DEFAULT 'feature',
  	"sponsored_by_id" integer,
  	"hero_image_id" integer,
  	"category" "payload"."enum_articles_category",
  	"governorate" "payload"."enum_articles_governorate",
  	"author_id" integer,
  	"published_at" timestamp(3) with time zone,
  	"print_issue_id" integer,
  	"print_page_from" numeric,
  	"print_page_to" numeric,
  	"seo_image_id" integer,
  	"seo_no_index" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."articles_locales" (
  	"title" varchar,
  	"excerpt" varchar,
  	"body" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"businesses_id" integer
  );
  
  CREATE TABLE "payload"."_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_kind" "payload"."enum__articles_v_version_kind" DEFAULT 'feature',
  	"version_sponsored_by_id" integer,
  	"version_hero_image_id" integer,
  	"version_category" "payload"."enum__articles_v_version_category",
  	"version_governorate" "payload"."enum__articles_v_version_governorate",
  	"version_author_id" integer,
  	"version_published_at" timestamp(3) with time zone,
  	"version_print_issue_id" integer,
  	"version_print_page_from" numeric,
  	"version_print_page_to" numeric,
  	"version_seo_image_id" integer,
  	"version_seo_no_index" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__articles_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "payload"."_articles_v_locales" (
  	"version_title" varchar,
  	"version_excerpt" varchar,
  	"version_body" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"businesses_id" integer
  );
  
  CREATE TABLE "payload"."issues" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"issue_number" numeric NOT NULL,
  	"cover_id" integer NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"page_count" numeric DEFAULT 100,
  	"print_run" numeric,
  	"digital_edition_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."issues_locales" (
  	"title" varchar NOT NULL,
  	"season" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"seo_image_id" integer,
  	"seo_no_index" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."pages_locales" (
  	"title" varchar,
  	"body" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_seo_image_id" integer,
  	"version_seo_no_index" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__pages_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "payload"."_pages_v_locales" (
  	"version_title" varchar,
  	"version_body" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"credit" varchar,
  	"usage_rights" "payload"."enum_media_usage_rights" DEFAULT 'owned',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_portrait_url" varchar,
  	"sizes_portrait_width" numeric,
  	"sizes_portrait_height" numeric,
  	"sizes_portrait_mime_type" varchar,
  	"sizes_portrait_filesize" numeric,
  	"sizes_portrait_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar,
  	"sizes_og_url" varchar,
  	"sizes_og_width" numeric,
  	"sizes_og_height" numeric,
  	"sizes_og_mime_type" varchar,
  	"sizes_og_filesize" numeric,
  	"sizes_og_filename" varchar
  );
  
  CREATE TABLE "payload"."media_locales" (
  	"alt" varchar NOT NULL,
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "payload"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"phone" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."scan_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"qr_code_id" integer,
  	"business_id" integer,
  	"scanned_at" timestamp(3) with time zone NOT NULL,
  	"placement" "payload"."enum_scan_events_placement",
  	"city" varchar,
  	"country" varchar,
  	"platform" "payload"."enum_scan_events_platform",
  	"is_direct_scan" boolean DEFAULT true
  );
  
  CREATE TABLE "payload"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"businesses_id" integer,
  	"qr_codes_id" integer,
  	"articles_id" integer,
  	"issues_id" integer,
  	"pages_id" integer,
  	"media_id" integer,
  	"users_id" integer,
  	"scan_events_id" integer
  );
  
  CREATE TABLE "payload"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."businesses_amenities" ADD CONSTRAINT "businesses_amenities_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_subcategories" ADD CONSTRAINT "businesses_subcategories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_opening_hours" ADD CONSTRAINT "businesses_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_seasonality" ADD CONSTRAINT "businesses_seasonality_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_sales_owner_id_users_id_fk" FOREIGN KEY ("sales_owner_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "payload"."qr_codes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."businesses_locales" ADD CONSTRAINT "businesses_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_texts" ADD CONSTRAINT "businesses_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_rels" ADD CONSTRAINT "businesses_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."businesses_rels" ADD CONSTRAINT "businesses_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_version_amenities" ADD CONSTRAINT "_businesses_v_version_amenities_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_businesses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_version_subcategories" ADD CONSTRAINT "_businesses_v_version_subcategories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_businesses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_version_opening_hours" ADD CONSTRAINT "_businesses_v_version_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_businesses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_version_seasonality" ADD CONSTRAINT "_businesses_v_version_seasonality_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_businesses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v" ADD CONSTRAINT "_businesses_v_parent_id_businesses_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v" ADD CONSTRAINT "_businesses_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v" ADD CONSTRAINT "_businesses_v_version_logo_id_media_id_fk" FOREIGN KEY ("version_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v" ADD CONSTRAINT "_businesses_v_version_sales_owner_id_users_id_fk" FOREIGN KEY ("version_sales_owner_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v" ADD CONSTRAINT "_businesses_v_version_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("version_qr_code_id") REFERENCES "payload"."qr_codes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v" ADD CONSTRAINT "_businesses_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_locales" ADD CONSTRAINT "_businesses_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_businesses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_texts" ADD CONSTRAINT "_businesses_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_businesses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_rels" ADD CONSTRAINT "_businesses_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_businesses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v_rels" ADD CONSTRAINT "_businesses_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."qr_codes" ADD CONSTRAINT "qr_codes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."qr_codes" ADD CONSTRAINT "qr_codes_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "payload"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."qr_codes" ADD CONSTRAINT "qr_codes_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "payload"."issues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."articles" ADD CONSTRAINT "articles_sponsored_by_id_businesses_id_fk" FOREIGN KEY ("sponsored_by_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."articles" ADD CONSTRAINT "articles_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."articles" ADD CONSTRAINT "articles_print_issue_id_issues_id_fk" FOREIGN KEY ("print_issue_id") REFERENCES "payload"."issues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."articles" ADD CONSTRAINT "articles_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."articles_locales" ADD CONSTRAINT "articles_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."articles_rels" ADD CONSTRAINT "articles_rels_businesses_fk" FOREIGN KEY ("businesses_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v" ADD CONSTRAINT "_articles_v_version_sponsored_by_id_businesses_id_fk" FOREIGN KEY ("version_sponsored_by_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v" ADD CONSTRAINT "_articles_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v" ADD CONSTRAINT "_articles_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v" ADD CONSTRAINT "_articles_v_version_print_issue_id_issues_id_fk" FOREIGN KEY ("version_print_issue_id") REFERENCES "payload"."issues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v" ADD CONSTRAINT "_articles_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v_locales" ADD CONSTRAINT "_articles_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_businesses_fk" FOREIGN KEY ("businesses_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."issues" ADD CONSTRAINT "issues_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."issues" ADD CONSTRAINT "issues_digital_edition_id_media_id_fk" FOREIGN KEY ("digital_edition_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."issues_locales" ADD CONSTRAINT "issues_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."issues"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."scan_events" ADD CONSTRAINT "scan_events_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "payload"."qr_codes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scan_events" ADD CONSTRAINT "scan_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_businesses_fk" FOREIGN KEY ("businesses_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_qr_codes_fk" FOREIGN KEY ("qr_codes_id") REFERENCES "payload"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "payload"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_issues_fk" FOREIGN KEY ("issues_id") REFERENCES "payload"."issues"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scan_events_fk" FOREIGN KEY ("scan_events_id") REFERENCES "payload"."scan_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "businesses_amenities_order_idx" ON "payload"."businesses_amenities" USING btree ("order");
  CREATE INDEX "businesses_amenities_parent_idx" ON "payload"."businesses_amenities" USING btree ("parent_id");
  CREATE INDEX "businesses_subcategories_order_idx" ON "payload"."businesses_subcategories" USING btree ("order");
  CREATE INDEX "businesses_subcategories_parent_idx" ON "payload"."businesses_subcategories" USING btree ("parent_id");
  CREATE INDEX "businesses_opening_hours_order_idx" ON "payload"."businesses_opening_hours" USING btree ("_order");
  CREATE INDEX "businesses_opening_hours_parent_id_idx" ON "payload"."businesses_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "businesses_seasonality_order_idx" ON "payload"."businesses_seasonality" USING btree ("order");
  CREATE INDEX "businesses_seasonality_parent_idx" ON "payload"."businesses_seasonality" USING btree ("parent_id");
  CREATE UNIQUE INDEX "businesses_slug_idx" ON "payload"."businesses" USING btree ("slug");
  CREATE INDEX "businesses_hero_image_idx" ON "payload"."businesses" USING btree ("hero_image_id");
  CREATE INDEX "businesses_logo_idx" ON "payload"."businesses" USING btree ("logo_id");
  CREATE INDEX "businesses_category_idx" ON "payload"."businesses" USING btree ("category");
  CREATE INDEX "businesses_governorate_idx" ON "payload"."businesses" USING btree ("governorate");
  CREATE INDEX "businesses_district_idx" ON "payload"."businesses" USING btree ("district");
  CREATE INDEX "businesses_location_idx" ON "payload"."businesses" USING btree ("location");
  CREATE INDEX "businesses_tier_idx" ON "payload"."businesses" USING btree ("tier");
  CREATE INDEX "businesses_contract_ends_at_idx" ON "payload"."businesses" USING btree ("contract_ends_at");
  CREATE INDEX "businesses_sales_owner_idx" ON "payload"."businesses" USING btree ("sales_owner_id");
  CREATE INDEX "businesses_qr_code_idx" ON "payload"."businesses" USING btree ("qr_code_id");
  CREATE INDEX "businesses_seo_seo_image_idx" ON "payload"."businesses" USING btree ("seo_image_id");
  CREATE INDEX "businesses_updated_at_idx" ON "payload"."businesses" USING btree ("updated_at");
  CREATE INDEX "businesses_created_at_idx" ON "payload"."businesses" USING btree ("created_at");
  CREATE INDEX "businesses__status_idx" ON "payload"."businesses" USING btree ("_status");
  CREATE INDEX "businesses_name_idx" ON "payload"."businesses_locales" USING btree ("name","_locale");
  CREATE UNIQUE INDEX "businesses_locales_locale_parent_id_unique" ON "payload"."businesses_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "businesses_texts_order_parent" ON "payload"."businesses_texts" USING btree ("order","parent_id");
  CREATE INDEX "businesses_rels_order_idx" ON "payload"."businesses_rels" USING btree ("order");
  CREATE INDEX "businesses_rels_parent_idx" ON "payload"."businesses_rels" USING btree ("parent_id");
  CREATE INDEX "businesses_rels_path_idx" ON "payload"."businesses_rels" USING btree ("path");
  CREATE INDEX "businesses_rels_media_id_idx" ON "payload"."businesses_rels" USING btree ("media_id");
  CREATE INDEX "_businesses_v_version_amenities_order_idx" ON "payload"."_businesses_v_version_amenities" USING btree ("order");
  CREATE INDEX "_businesses_v_version_amenities_parent_idx" ON "payload"."_businesses_v_version_amenities" USING btree ("parent_id");
  CREATE INDEX "_businesses_v_version_subcategories_order_idx" ON "payload"."_businesses_v_version_subcategories" USING btree ("order");
  CREATE INDEX "_businesses_v_version_subcategories_parent_idx" ON "payload"."_businesses_v_version_subcategories" USING btree ("parent_id");
  CREATE INDEX "_businesses_v_version_opening_hours_order_idx" ON "payload"."_businesses_v_version_opening_hours" USING btree ("_order");
  CREATE INDEX "_businesses_v_version_opening_hours_parent_id_idx" ON "payload"."_businesses_v_version_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "_businesses_v_version_seasonality_order_idx" ON "payload"."_businesses_v_version_seasonality" USING btree ("order");
  CREATE INDEX "_businesses_v_version_seasonality_parent_idx" ON "payload"."_businesses_v_version_seasonality" USING btree ("parent_id");
  CREATE INDEX "_businesses_v_parent_idx" ON "payload"."_businesses_v" USING btree ("parent_id");
  CREATE INDEX "_businesses_v_version_version_slug_idx" ON "payload"."_businesses_v" USING btree ("version_slug");
  CREATE INDEX "_businesses_v_version_version_hero_image_idx" ON "payload"."_businesses_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_businesses_v_version_version_logo_idx" ON "payload"."_businesses_v" USING btree ("version_logo_id");
  CREATE INDEX "_businesses_v_version_version_category_idx" ON "payload"."_businesses_v" USING btree ("version_category");
  CREATE INDEX "_businesses_v_version_version_governorate_idx" ON "payload"."_businesses_v" USING btree ("version_governorate");
  CREATE INDEX "_businesses_v_version_version_district_idx" ON "payload"."_businesses_v" USING btree ("version_district");
  CREATE INDEX "_businesses_v_version_version_location_idx" ON "payload"."_businesses_v" USING btree ("version_location");
  CREATE INDEX "_businesses_v_version_version_tier_idx" ON "payload"."_businesses_v" USING btree ("version_tier");
  CREATE INDEX "_businesses_v_version_version_contract_ends_at_idx" ON "payload"."_businesses_v" USING btree ("version_contract_ends_at");
  CREATE INDEX "_businesses_v_version_version_sales_owner_idx" ON "payload"."_businesses_v" USING btree ("version_sales_owner_id");
  CREATE INDEX "_businesses_v_version_version_qr_code_idx" ON "payload"."_businesses_v" USING btree ("version_qr_code_id");
  CREATE INDEX "_businesses_v_version_seo_version_seo_image_idx" ON "payload"."_businesses_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_businesses_v_version_version_updated_at_idx" ON "payload"."_businesses_v" USING btree ("version_updated_at");
  CREATE INDEX "_businesses_v_version_version_created_at_idx" ON "payload"."_businesses_v" USING btree ("version_created_at");
  CREATE INDEX "_businesses_v_version_version__status_idx" ON "payload"."_businesses_v" USING btree ("version__status");
  CREATE INDEX "_businesses_v_created_at_idx" ON "payload"."_businesses_v" USING btree ("created_at");
  CREATE INDEX "_businesses_v_updated_at_idx" ON "payload"."_businesses_v" USING btree ("updated_at");
  CREATE INDEX "_businesses_v_snapshot_idx" ON "payload"."_businesses_v" USING btree ("snapshot");
  CREATE INDEX "_businesses_v_published_locale_idx" ON "payload"."_businesses_v" USING btree ("published_locale");
  CREATE INDEX "_businesses_v_latest_idx" ON "payload"."_businesses_v" USING btree ("latest");
  CREATE INDEX "_businesses_v_version_version_name_idx" ON "payload"."_businesses_v_locales" USING btree ("version_name","_locale");
  CREATE UNIQUE INDEX "_businesses_v_locales_locale_parent_id_unique" ON "payload"."_businesses_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_businesses_v_texts_order_parent" ON "payload"."_businesses_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_businesses_v_rels_order_idx" ON "payload"."_businesses_v_rels" USING btree ("order");
  CREATE INDEX "_businesses_v_rels_parent_idx" ON "payload"."_businesses_v_rels" USING btree ("parent_id");
  CREATE INDEX "_businesses_v_rels_path_idx" ON "payload"."_businesses_v_rels" USING btree ("path");
  CREATE INDEX "_businesses_v_rels_media_id_idx" ON "payload"."_businesses_v_rels" USING btree ("media_id");
  CREATE UNIQUE INDEX "qr_codes_code_idx" ON "payload"."qr_codes" USING btree ("code");
  CREATE INDEX "qr_codes_business_idx" ON "payload"."qr_codes" USING btree ("business_id");
  CREATE INDEX "qr_codes_article_idx" ON "payload"."qr_codes" USING btree ("article_id");
  CREATE INDEX "qr_codes_issue_idx" ON "payload"."qr_codes" USING btree ("issue_id");
  CREATE INDEX "qr_codes_scan_count_idx" ON "payload"."qr_codes" USING btree ("scan_count");
  CREATE INDEX "qr_codes_updated_at_idx" ON "payload"."qr_codes" USING btree ("updated_at");
  CREATE INDEX "qr_codes_created_at_idx" ON "payload"."qr_codes" USING btree ("created_at");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "payload"."articles" USING btree ("slug");
  CREATE INDEX "articles_sponsored_by_idx" ON "payload"."articles" USING btree ("sponsored_by_id");
  CREATE INDEX "articles_hero_image_idx" ON "payload"."articles" USING btree ("hero_image_id");
  CREATE INDEX "articles_author_idx" ON "payload"."articles" USING btree ("author_id");
  CREATE INDEX "articles_published_at_idx" ON "payload"."articles" USING btree ("published_at");
  CREATE INDEX "articles_print_print_issue_idx" ON "payload"."articles" USING btree ("print_issue_id");
  CREATE INDEX "articles_seo_seo_image_idx" ON "payload"."articles" USING btree ("seo_image_id");
  CREATE INDEX "articles_updated_at_idx" ON "payload"."articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "payload"."articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "payload"."articles" USING btree ("_status");
  CREATE UNIQUE INDEX "articles_locales_locale_parent_id_unique" ON "payload"."articles_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_rels_order_idx" ON "payload"."articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "payload"."articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "payload"."articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_businesses_id_idx" ON "payload"."articles_rels" USING btree ("businesses_id");
  CREATE INDEX "_articles_v_parent_idx" ON "payload"."_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "payload"."_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_sponsored_by_idx" ON "payload"."_articles_v" USING btree ("version_sponsored_by_id");
  CREATE INDEX "_articles_v_version_version_hero_image_idx" ON "payload"."_articles_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_articles_v_version_version_author_idx" ON "payload"."_articles_v" USING btree ("version_author_id");
  CREATE INDEX "_articles_v_version_version_published_at_idx" ON "payload"."_articles_v" USING btree ("version_published_at");
  CREATE INDEX "_articles_v_version_print_version_print_issue_idx" ON "payload"."_articles_v" USING btree ("version_print_issue_id");
  CREATE INDEX "_articles_v_version_seo_version_seo_image_idx" ON "payload"."_articles_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "payload"."_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "payload"."_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "payload"."_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "payload"."_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "payload"."_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_snapshot_idx" ON "payload"."_articles_v" USING btree ("snapshot");
  CREATE INDEX "_articles_v_published_locale_idx" ON "payload"."_articles_v" USING btree ("published_locale");
  CREATE INDEX "_articles_v_latest_idx" ON "payload"."_articles_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_articles_v_locales_locale_parent_id_unique" ON "payload"."_articles_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_rels_order_idx" ON "payload"."_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "payload"."_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "payload"."_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_businesses_id_idx" ON "payload"."_articles_v_rels" USING btree ("businesses_id");
  CREATE UNIQUE INDEX "issues_slug_idx" ON "payload"."issues" USING btree ("slug");
  CREATE UNIQUE INDEX "issues_issue_number_idx" ON "payload"."issues" USING btree ("issue_number");
  CREATE INDEX "issues_cover_idx" ON "payload"."issues" USING btree ("cover_id");
  CREATE INDEX "issues_digital_edition_idx" ON "payload"."issues" USING btree ("digital_edition_id");
  CREATE INDEX "issues_updated_at_idx" ON "payload"."issues" USING btree ("updated_at");
  CREATE INDEX "issues_created_at_idx" ON "payload"."issues" USING btree ("created_at");
  CREATE UNIQUE INDEX "issues_locales_locale_parent_id_unique" ON "payload"."issues_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE INDEX "pages_seo_seo_image_idx" ON "payload"."pages" USING btree ("seo_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "payload"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "payload"."pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "payload"."pages" USING btree ("_status");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "payload"."pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "payload"."_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "payload"."_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_seo_version_seo_image_idx" ON "payload"."_pages_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "payload"."_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "payload"."_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "payload"."_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "payload"."_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "payload"."_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "payload"."_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "payload"."_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "payload"."_pages_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "payload"."_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "media_updated_at_idx" ON "payload"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "payload"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "payload"."media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "payload"."media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "payload"."media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_portrait_sizes_portrait_filename_idx" ON "payload"."media" USING btree ("sizes_portrait_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "payload"."media" USING btree ("sizes_hero_filename");
  CREATE INDEX "media_sizes_og_sizes_og_filename_idx" ON "payload"."media" USING btree ("sizes_og_filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "payload"."media_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "users_roles_order_idx" ON "payload"."users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "payload"."users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "payload"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "payload"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "payload"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "payload"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "payload"."users" USING btree ("email");
  CREATE INDEX "scan_events_code_idx" ON "payload"."scan_events" USING btree ("code");
  CREATE INDEX "scan_events_qr_code_idx" ON "payload"."scan_events" USING btree ("qr_code_id");
  CREATE INDEX "scan_events_business_idx" ON "payload"."scan_events" USING btree ("business_id");
  CREATE INDEX "scan_events_scanned_at_idx" ON "payload"."scan_events" USING btree ("scanned_at");
  CREATE INDEX "scan_events_placement_idx" ON "payload"."scan_events" USING btree ("placement");
  CREATE INDEX "scan_events_country_idx" ON "payload"."scan_events" USING btree ("country");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_businesses_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("businesses_id");
  CREATE INDEX "payload_locked_documents_rels_qr_codes_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("qr_codes_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_issues_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("issues_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_scan_events_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scan_events_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload"."payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."businesses_amenities" CASCADE;
  DROP TABLE "payload"."businesses_subcategories" CASCADE;
  DROP TABLE "payload"."businesses_opening_hours" CASCADE;
  DROP TABLE "payload"."businesses_seasonality" CASCADE;
  DROP TABLE "payload"."businesses" CASCADE;
  DROP TABLE "payload"."businesses_locales" CASCADE;
  DROP TABLE "payload"."businesses_texts" CASCADE;
  DROP TABLE "payload"."businesses_rels" CASCADE;
  DROP TABLE "payload"."_businesses_v_version_amenities" CASCADE;
  DROP TABLE "payload"."_businesses_v_version_subcategories" CASCADE;
  DROP TABLE "payload"."_businesses_v_version_opening_hours" CASCADE;
  DROP TABLE "payload"."_businesses_v_version_seasonality" CASCADE;
  DROP TABLE "payload"."_businesses_v" CASCADE;
  DROP TABLE "payload"."_businesses_v_locales" CASCADE;
  DROP TABLE "payload"."_businesses_v_texts" CASCADE;
  DROP TABLE "payload"."_businesses_v_rels" CASCADE;
  DROP TABLE "payload"."qr_codes" CASCADE;
  DROP TABLE "payload"."articles" CASCADE;
  DROP TABLE "payload"."articles_locales" CASCADE;
  DROP TABLE "payload"."articles_rels" CASCADE;
  DROP TABLE "payload"."_articles_v" CASCADE;
  DROP TABLE "payload"."_articles_v_locales" CASCADE;
  DROP TABLE "payload"."_articles_v_rels" CASCADE;
  DROP TABLE "payload"."issues" CASCADE;
  DROP TABLE "payload"."issues_locales" CASCADE;
  DROP TABLE "payload"."pages" CASCADE;
  DROP TABLE "payload"."pages_locales" CASCADE;
  DROP TABLE "payload"."_pages_v" CASCADE;
  DROP TABLE "payload"."_pages_v_locales" CASCADE;
  DROP TABLE "payload"."media" CASCADE;
  DROP TABLE "payload"."media_locales" CASCADE;
  DROP TABLE "payload"."users_roles" CASCADE;
  DROP TABLE "payload"."users_sessions" CASCADE;
  DROP TABLE "payload"."users" CASCADE;
  DROP TABLE "payload"."scan_events" CASCADE;
  DROP TABLE "payload"."payload_kv" CASCADE;
  DROP TABLE "payload"."payload_locked_documents" CASCADE;
  DROP TABLE "payload"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload"."payload_preferences" CASCADE;
  DROP TABLE "payload"."payload_preferences_rels" CASCADE;
  DROP TABLE "payload"."payload_migrations" CASCADE;
  DROP TYPE "payload"."_locales";
  DROP TYPE "payload"."enum_businesses_amenities";
  DROP TYPE "payload"."enum_businesses_subcategories";
  DROP TYPE "payload"."enum_businesses_opening_hours_day";
  DROP TYPE "payload"."enum_businesses_seasonality";
  DROP TYPE "payload"."enum_businesses_price_range";
  DROP TYPE "payload"."enum_businesses_category";
  DROP TYPE "payload"."enum_businesses_governorate";
  DROP TYPE "payload"."enum_businesses_district";
  DROP TYPE "payload"."enum_businesses_tier";
  DROP TYPE "payload"."enum_businesses_status";
  DROP TYPE "payload"."enum__businesses_v_version_amenities";
  DROP TYPE "payload"."enum__businesses_v_version_subcategories";
  DROP TYPE "payload"."enum__businesses_v_version_opening_hours_day";
  DROP TYPE "payload"."enum__businesses_v_version_seasonality";
  DROP TYPE "payload"."enum__businesses_v_version_price_range";
  DROP TYPE "payload"."enum__businesses_v_version_category";
  DROP TYPE "payload"."enum__businesses_v_version_governorate";
  DROP TYPE "payload"."enum__businesses_v_version_district";
  DROP TYPE "payload"."enum__businesses_v_version_tier";
  DROP TYPE "payload"."enum__businesses_v_version_status";
  DROP TYPE "payload"."enum__businesses_v_published_locale";
  DROP TYPE "payload"."enum_qr_codes_target_type";
  DROP TYPE "payload"."enum_qr_codes_placement";
  DROP TYPE "payload"."enum_articles_kind";
  DROP TYPE "payload"."enum_articles_category";
  DROP TYPE "payload"."enum_articles_governorate";
  DROP TYPE "payload"."enum_articles_status";
  DROP TYPE "payload"."enum__articles_v_version_kind";
  DROP TYPE "payload"."enum__articles_v_version_category";
  DROP TYPE "payload"."enum__articles_v_version_governorate";
  DROP TYPE "payload"."enum__articles_v_version_status";
  DROP TYPE "payload"."enum__articles_v_published_locale";
  DROP TYPE "payload"."enum_pages_status";
  DROP TYPE "payload"."enum__pages_v_version_status";
  DROP TYPE "payload"."enum__pages_v_published_locale";
  DROP TYPE "payload"."enum_media_usage_rights";
  DROP TYPE "payload"."enum_users_roles";
  DROP TYPE "payload"."enum_scan_events_placement";
  DROP TYPE "payload"."enum_scan_events_platform";`)
}
