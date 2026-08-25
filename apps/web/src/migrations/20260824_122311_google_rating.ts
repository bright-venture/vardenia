import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Reviews out, Google rating in.
 *
 * # One hand-edit, and it has to survive regeneration
 *
 * `migrate:create` generated this, and generated it wrong: it drops the reviews
 * tables with CASCADE and then drops the foreign key on
 * `payload_locked_documents_rels` by name. CASCADE has already taken that
 * constraint - it existed only because it pointed at `reviews` - so the second
 * statement fails with "constraint does not exist" and the whole migration
 * rolls back.
 *
 * It rolled back on the first production attempt, which is the only reason
 * this was cheap to find. `IF EXISTS` is the fix: correct whether or not
 * CASCADE got there first.
 *
 * If this file is ever regenerated, the guard will be gone. Put it back.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."reviews" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."reviews_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_reviews_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_reviews_v_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."reviews" CASCADE;
  DROP TABLE "payload"."reviews_locales" CASCADE;
  DROP TABLE "payload"."_reviews_v" CASCADE;
  DROP TABLE "payload"."_reviews_v_locales" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_reviews_fk";

  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_reviews_id_idx";
  ALTER TABLE "payload"."businesses" ADD COLUMN "google_rating" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "google_rating_count" numeric;
  ALTER TABLE "payload"."businesses" ADD COLUMN "rating_checked_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_google_rating" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_google_rating_count" numeric;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_rating_checked_at" timestamp(3) with time zone;
  CREATE INDEX "businesses_google_rating_idx" ON "payload"."businesses" USING btree ("google_rating");
  CREATE INDEX "_businesses_v_version_version_google_rating_idx" ON "payload"."_businesses_v" USING btree ("version_google_rating");
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "reviews_id";
  DROP TYPE "payload"."enum_reviews_source";
  DROP TYPE "payload"."enum_reviews_status";
  DROP TYPE "payload"."enum__reviews_v_version_source";
  DROP TYPE "payload"."enum__reviews_v_version_status";
  DROP TYPE "payload"."enum__reviews_v_published_locale";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_reviews_source" AS ENUM('editorial', 'guest', 'partner');
  CREATE TYPE "payload"."enum_reviews_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__reviews_v_version_source" AS ENUM('editorial', 'guest', 'partner');
  CREATE TYPE "payload"."enum__reviews_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__reviews_v_published_locale" AS ENUM('en', 'ar');
  CREATE TABLE "payload"."reviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" integer,
  	"source" "payload"."enum_reviews_source" DEFAULT 'editorial',
  	"rating" numeric,
  	"visited_at" timestamp(3) with time zone,
  	"featured" boolean DEFAULT false,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_reviews_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."reviews_locales" (
  	"title" varchar,
  	"body" varchar,
  	"author_name" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_reviews_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_business_id" integer,
  	"version_source" "payload"."enum__reviews_v_version_source" DEFAULT 'editorial',
  	"version_rating" numeric,
  	"version_visited_at" timestamp(3) with time zone,
  	"version_featured" boolean DEFAULT false,
  	"version_published_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__reviews_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__reviews_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "payload"."_reviews_v_locales" (
  	"version_title" varchar,
  	"version_body" varchar,
  	"version_author_name" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  DROP INDEX "payload"."businesses_google_rating_idx";
  DROP INDEX "payload"."_businesses_v_version_version_google_rating_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "reviews_id" integer;
  ALTER TABLE "payload"."reviews" ADD CONSTRAINT "reviews_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."reviews_locales" ADD CONSTRAINT "reviews_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_reviews_v" ADD CONSTRAINT "_reviews_v_parent_id_reviews_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."reviews"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_reviews_v" ADD CONSTRAINT "_reviews_v_version_business_id_businesses_id_fk" FOREIGN KEY ("version_business_id") REFERENCES "payload"."businesses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_reviews_v_locales" ADD CONSTRAINT "_reviews_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_reviews_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "reviews_business_idx" ON "payload"."reviews" USING btree ("business_id");
  CREATE INDEX "reviews_source_idx" ON "payload"."reviews" USING btree ("source");
  CREATE INDEX "reviews_updated_at_idx" ON "payload"."reviews" USING btree ("updated_at");
  CREATE INDEX "reviews_created_at_idx" ON "payload"."reviews" USING btree ("created_at");
  CREATE INDEX "reviews__status_idx" ON "payload"."reviews" USING btree ("_status");
  CREATE UNIQUE INDEX "reviews_locales_locale_parent_id_unique" ON "payload"."reviews_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_reviews_v_parent_idx" ON "payload"."_reviews_v" USING btree ("parent_id");
  CREATE INDEX "_reviews_v_version_version_business_idx" ON "payload"."_reviews_v" USING btree ("version_business_id");
  CREATE INDEX "_reviews_v_version_version_source_idx" ON "payload"."_reviews_v" USING btree ("version_source");
  CREATE INDEX "_reviews_v_version_version_updated_at_idx" ON "payload"."_reviews_v" USING btree ("version_updated_at");
  CREATE INDEX "_reviews_v_version_version_created_at_idx" ON "payload"."_reviews_v" USING btree ("version_created_at");
  CREATE INDEX "_reviews_v_version_version__status_idx" ON "payload"."_reviews_v" USING btree ("version__status");
  CREATE INDEX "_reviews_v_created_at_idx" ON "payload"."_reviews_v" USING btree ("created_at");
  CREATE INDEX "_reviews_v_updated_at_idx" ON "payload"."_reviews_v" USING btree ("updated_at");
  CREATE INDEX "_reviews_v_snapshot_idx" ON "payload"."_reviews_v" USING btree ("snapshot");
  CREATE INDEX "_reviews_v_published_locale_idx" ON "payload"."_reviews_v" USING btree ("published_locale");
  CREATE INDEX "_reviews_v_latest_idx" ON "payload"."_reviews_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_reviews_v_locales_locale_parent_id_unique" ON "payload"."_reviews_v_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reviews_fk" FOREIGN KEY ("reviews_id") REFERENCES "payload"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_reviews_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("reviews_id");
  ALTER TABLE "payload"."businesses" DROP COLUMN "google_rating";
  ALTER TABLE "payload"."businesses" DROP COLUMN "google_rating_count";
  ALTER TABLE "payload"."businesses" DROP COLUMN "rating_checked_at";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_google_rating";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_google_rating_count";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_rating_checked_at";`)
}
