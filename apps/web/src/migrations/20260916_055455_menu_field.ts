import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses" ADD COLUMN "menu_id" integer;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_menu_id" integer;
  ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_menu_id_media_id_fk" FOREIGN KEY ("menu_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_businesses_v" ADD CONSTRAINT "_businesses_v_version_menu_id_media_id_fk" FOREIGN KEY ("version_menu_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "businesses_menu_idx" ON "payload"."businesses" USING btree ("menu_id");
  CREATE INDEX "_businesses_v_version_version_menu_idx" ON "payload"."_businesses_v" USING btree ("version_menu_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses" DROP CONSTRAINT "businesses_menu_id_media_id_fk";
  
  ALTER TABLE "payload"."_businesses_v" DROP CONSTRAINT "_businesses_v_version_menu_id_media_id_fk";
  
  DROP INDEX "payload"."businesses_menu_idx";
  DROP INDEX "payload"."_businesses_v_version_version_menu_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN "menu_id";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_menu_id";`)
}
