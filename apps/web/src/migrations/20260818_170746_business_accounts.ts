import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."business_users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "payload"."business_users" (
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
  
  CREATE TABLE "payload"."business_users_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"businesses_id" integer
  );
  
  CREATE TABLE "payload"."customers_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "payload"."customers" (
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
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "business_users_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "customers_id" integer;
  ALTER TABLE "payload"."payload_preferences_rels" ADD COLUMN "business_users_id" integer;
  ALTER TABLE "payload"."payload_preferences_rels" ADD COLUMN "customers_id" integer;
  ALTER TABLE "payload"."business_users_sessions" ADD CONSTRAINT "business_users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."business_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."business_users_rels" ADD CONSTRAINT "business_users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."business_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."business_users_rels" ADD CONSTRAINT "business_users_rels_businesses_fk" FOREIGN KEY ("businesses_id") REFERENCES "payload"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."customers_sessions" ADD CONSTRAINT "customers_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."customers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "business_users_sessions_order_idx" ON "payload"."business_users_sessions" USING btree ("_order");
  CREATE INDEX "business_users_sessions_parent_id_idx" ON "payload"."business_users_sessions" USING btree ("_parent_id");
  CREATE INDEX "business_users_updated_at_idx" ON "payload"."business_users" USING btree ("updated_at");
  CREATE INDEX "business_users_created_at_idx" ON "payload"."business_users" USING btree ("created_at");
  CREATE UNIQUE INDEX "business_users_email_idx" ON "payload"."business_users" USING btree ("email");
  CREATE INDEX "business_users_rels_order_idx" ON "payload"."business_users_rels" USING btree ("order");
  CREATE INDEX "business_users_rels_parent_idx" ON "payload"."business_users_rels" USING btree ("parent_id");
  CREATE INDEX "business_users_rels_path_idx" ON "payload"."business_users_rels" USING btree ("path");
  CREATE INDEX "business_users_rels_businesses_id_idx" ON "payload"."business_users_rels" USING btree ("businesses_id");
  CREATE INDEX "customers_sessions_order_idx" ON "payload"."customers_sessions" USING btree ("_order");
  CREATE INDEX "customers_sessions_parent_id_idx" ON "payload"."customers_sessions" USING btree ("_parent_id");
  CREATE INDEX "customers_updated_at_idx" ON "payload"."customers" USING btree ("updated_at");
  CREATE INDEX "customers_created_at_idx" ON "payload"."customers" USING btree ("created_at");
  CREATE UNIQUE INDEX "customers_email_idx" ON "payload"."customers" USING btree ("email");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_business_users_fk" FOREIGN KEY ("business_users_id") REFERENCES "payload"."business_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customers_fk" FOREIGN KEY ("customers_id") REFERENCES "payload"."customers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_business_users_fk" FOREIGN KEY ("business_users_id") REFERENCES "payload"."business_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_customers_fk" FOREIGN KEY ("customers_id") REFERENCES "payload"."customers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_business_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("business_users_id");
  CREATE INDEX "payload_locked_documents_rels_customers_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("customers_id");
  CREATE INDEX "payload_preferences_rels_business_users_id_idx" ON "payload"."payload_preferences_rels" USING btree ("business_users_id");
  CREATE INDEX "payload_preferences_rels_customers_id_idx" ON "payload"."payload_preferences_rels" USING btree ("customers_id");`)
}

/**
 * Rewritten from what was generated, for the same reason as the Pages removal.
 *
 * The generated version dropped the tables with CASCADE and then dropped the
 * foreign keys pointing at them. CASCADE has already removed those constraints,
 * so the later statements fail on something that is no longer there - a rollback
 * that errors halfway, at the exact moment somebody is trying to undo a bad
 * deploy.
 *
 * Every statement is `IF EXISTS`, and the drops are ordered so nothing depends
 * on the order anyway. A `down` that can be run twice is worth more than one
 * that is minimal.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_business_users_fk";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_customers_fk";
  ALTER TABLE "payload"."payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_business_users_fk";
  ALTER TABLE "payload"."payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_customers_fk";

  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_business_users_id_idx";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_customers_id_idx";
  DROP INDEX IF EXISTS "payload"."payload_preferences_rels_business_users_id_idx";
  DROP INDEX IF EXISTS "payload"."payload_preferences_rels_customers_id_idx";

  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "business_users_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "customers_id";
  ALTER TABLE "payload"."payload_preferences_rels" DROP COLUMN IF EXISTS "business_users_id";
  ALTER TABLE "payload"."payload_preferences_rels" DROP COLUMN IF EXISTS "customers_id";

  DROP TABLE IF EXISTS "payload"."business_users_sessions" CASCADE;
  DROP TABLE IF EXISTS "payload"."business_users_rels" CASCADE;
  DROP TABLE IF EXISTS "payload"."business_users" CASCADE;
  DROP TABLE IF EXISTS "payload"."customers_sessions" CASCADE;
  DROP TABLE IF EXISTS "payload"."customers" CASCADE;`)
}
