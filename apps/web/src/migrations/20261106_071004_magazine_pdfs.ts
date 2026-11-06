import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Magazine PDFs get a library of their own (collections/Editions), so an issue
 * PDF can be up to 200 MB while photos stay at 25 MB, and the issue's Digital
 * edition field points at it instead of the media library.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."editions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"_objectkey" varchar,
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
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload"."issues" DROP CONSTRAINT "issues_digital_edition_id_media_id_fk";
  -- The field now points at Magazine PDFs. No issue had a PDF in the media
  -- library on 6 November 2026; if one does, its link is cleared rather than
  -- left pointing at the wrong table, which the new constraint would refuse.
  UPDATE "payload"."issues" SET "digital_edition_id" = NULL WHERE "digital_edition_id" IS NOT NULL;
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "editions_id" integer;
  CREATE INDEX "editions_updated_at_idx" ON "payload"."editions" USING btree ("updated_at");
  CREATE INDEX "editions_created_at_idx" ON "payload"."editions" USING btree ("created_at");
  CREATE UNIQUE INDEX "editions_filename_idx" ON "payload"."editions" USING btree ("filename");
  ALTER TABLE "payload"."issues" ADD CONSTRAINT "issues_digital_edition_id_editions_id_fk" FOREIGN KEY ("digital_edition_id") REFERENCES "payload"."editions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_editions_fk" FOREIGN KEY ("editions_id") REFERENCES "payload"."editions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_editions_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("editions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."editions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."editions" CASCADE;
  ALTER TABLE "payload"."issues" DROP CONSTRAINT "issues_digital_edition_id_editions_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_editions_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_editions_id_idx";
  ALTER TABLE "payload"."issues" ADD CONSTRAINT "issues_digital_edition_id_media_id_fk" FOREIGN KEY ("digital_edition_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "editions_id";`)
}
