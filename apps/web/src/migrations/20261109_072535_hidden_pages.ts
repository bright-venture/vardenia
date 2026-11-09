import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The "Hidden pages" list on the Settings page (lib/hidden-pages), added on 9
 * November 2026. Additive and empty, so every page stays shown until an admin
 * hides one.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_settings_hidden_pages" AS ENUM('about', 'contact', 'faq', 'partner-with-us', 'advertise', 'add-your-business');
  CREATE TABLE "payload"."settings_hidden_pages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_settings_hidden_pages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "payload"."settings_hidden_pages" ADD CONSTRAINT "settings_hidden_pages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "settings_hidden_pages_order_idx" ON "payload"."settings_hidden_pages" USING btree ("order");
  CREATE INDEX "settings_hidden_pages_parent_idx" ON "payload"."settings_hidden_pages" USING btree ("parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."settings_hidden_pages" CASCADE;
  DROP TYPE "payload"."enum_settings_hidden_pages";`)
}
