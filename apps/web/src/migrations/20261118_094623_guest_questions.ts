import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Guest questions from the Questions page (18 November 2026): one new table.
 * The team answers in the admin and the answer is emailed to the guest once
 * (answered_at). Row level security on, like every table here.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_guest_questions_status" AS ENUM('new', 'answered');
  CREATE TABLE "payload"."guest_questions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "payload"."enum_guest_questions_status" DEFAULT 'new' NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" varchar,
  	"answered_at" timestamp(3) with time zone,
  	"locale" varchar,
  	"internal_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "guest_questions_id" integer;
  CREATE INDEX "guest_questions_status_idx" ON "payload"."guest_questions" USING btree ("status");
  CREATE INDEX "guest_questions_updated_at_idx" ON "payload"."guest_questions" USING btree ("updated_at");
  CREATE INDEX "guest_questions_created_at_idx" ON "payload"."guest_questions" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_guest_questions_fk" FOREIGN KEY ("guest_questions_id") REFERENCES "payload"."guest_questions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_guest_questions_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("guest_questions_id");
  ALTER TABLE "payload"."guest_questions" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."guest_questions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."guest_questions" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_guest_questions_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_guest_questions_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "guest_questions_id";
  DROP TYPE "payload"."enum_guest_questions_status";`)
}
