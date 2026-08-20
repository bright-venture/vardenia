import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."customers" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  CREATE INDEX "customers_deleted_at_idx" ON "payload"."customers" USING btree ("deleted_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."customers_deleted_at_idx";
  ALTER TABLE "payload"."customers" DROP COLUMN "deleted_at";`)
}
