import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Templates, slots and layout prices (26 November 2026, PRD v7). Adds:
 *  - the `templates` collection (`templates`, `templates_pages`): a name and
 *    the ordered pages of an issue, one layout each, and whether an issue
 *    uses it (`locked`); plus its column in `payload_locked_documents_rels`,
 *    which Payload keeps for every collection;
 *  - `issues.template_id` (the template an issue is built from) and
 *    `issues.slots`, the slots copied from it when it is assigned;
 *  - `issues_layouts`, the price table: layout, on sale, price;
 *  - `listing_ranges.first_page` / `last_page`, a governorate's pages on an
 *    issue with a template (its numbers are derived from them);
 *  - `businesses.page_layout`, the layout a business bought (written once),
 *    and `submission_terms_layout` / `_issue` / `_page`, the labels copied into
 *    the terms when the form is sent.
 *
 * Data: none. Existing issues simply have no template and keep their typed
 * total and manual number ranges; no business gets a layout.
 *
 * `down` drops what this adds.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- The ALTERs and the FKs take heavy locks while old code still serves traffic.
  SET LOCAL lock_timeout = '5s';
  CREATE TYPE "payload"."enum_businesses_page_layout" AS ENUM('full-spread', 'full-page', 'half-page', 'three-third', 'quarter-page');
  CREATE TYPE "payload"."enum_issues_layouts_layout" AS ENUM('full-spread', 'full-page', 'half-page', 'three-third', 'quarter-page');
  CREATE TYPE "payload"."enum_templates_pages_layout" AS ENUM('full-spread', 'full-page', 'half-page', 'three-third', 'quarter-page');
  CREATE TABLE "payload"."issues_layouts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"layout" "payload"."enum_issues_layouts_layout" NOT NULL,
  	"offered" boolean DEFAULT false,
  	"price" numeric
  );

  CREATE TABLE "payload"."templates_pages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"layout" "payload"."enum_templates_pages_layout" NOT NULL
  );

  CREATE TABLE "payload"."templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"locked" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "page_layout" "payload"."enum_businesses_page_layout";
  ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "submission_terms_layout" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "submission_terms_issue" varchar;
  ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "submission_terms_page" varchar;
  ALTER TABLE "payload"."issues" ADD COLUMN IF NOT EXISTS "template_id" integer;
  ALTER TABLE "payload"."issues" ADD COLUMN IF NOT EXISTS "slots" jsonb;
  ALTER TABLE "payload"."listing_ranges" ADD COLUMN IF NOT EXISTS "first_page" numeric;
  ALTER TABLE "payload"."listing_ranges" ADD COLUMN IF NOT EXISTS "last_page" numeric;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "templates_id" integer;
  ALTER TABLE "payload"."issues_layouts" ADD CONSTRAINT "issues_layouts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."issues"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_pages" ADD CONSTRAINT "templates_pages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "issues_layouts_order_idx" ON "payload"."issues_layouts" USING btree ("_order");
  CREATE INDEX "issues_layouts_parent_id_idx" ON "payload"."issues_layouts" USING btree ("_parent_id");
  CREATE INDEX "templates_pages_order_idx" ON "payload"."templates_pages" USING btree ("_order");
  CREATE INDEX "templates_pages_parent_id_idx" ON "payload"."templates_pages" USING btree ("_parent_id");
  CREATE INDEX "templates_updated_at_idx" ON "payload"."templates" USING btree ("updated_at");
  CREATE INDEX "templates_created_at_idx" ON "payload"."templates" USING btree ("created_at");
  ALTER TABLE "payload"."issues" ADD CONSTRAINT "issues_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "payload"."templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_templates_fk" FOREIGN KEY ("templates_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "issues_template_idx" ON "payload"."issues" USING btree ("template_id");
  CREATE INDEX "payload_locked_documents_rels_templates_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("templates_id");
  -- Row level security on, like every table here.
  ALTER TABLE "payload"."issues_layouts" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_pages" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  SET LOCAL lock_timeout = '5s';
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_templates_fk";
  ALTER TABLE "payload"."issues" DROP CONSTRAINT IF EXISTS "issues_template_id_templates_id_fk";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_templates_id_idx";
  DROP INDEX IF EXISTS "payload"."issues_template_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "templates_id";
  ALTER TABLE "payload"."listing_ranges" DROP COLUMN IF EXISTS "last_page";
  ALTER TABLE "payload"."listing_ranges" DROP COLUMN IF EXISTS "first_page";
  ALTER TABLE "payload"."issues" DROP COLUMN IF EXISTS "slots";
  ALTER TABLE "payload"."issues" DROP COLUMN IF EXISTS "template_id";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "submission_terms_page";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "submission_terms_issue";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "submission_terms_layout";
  ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "page_layout";
  DROP TABLE IF EXISTS "payload"."issues_layouts" CASCADE;
  DROP TABLE IF EXISTS "payload"."templates_pages" CASCADE;
  DROP TABLE IF EXISTS "payload"."templates" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_templates_pages_layout";
  DROP TYPE IF EXISTS "payload"."enum_issues_layouts_layout";
  DROP TYPE IF EXISTS "payload"."enum_businesses_page_layout";`)
}
