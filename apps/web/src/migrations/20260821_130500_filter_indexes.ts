import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "businesses_amenities_value_idx" ON "payload"."businesses_amenities" USING btree ("value");
  CREATE INDEX "businesses_subcategories_value_idx" ON "payload"."businesses_subcategories" USING btree ("value");
  CREATE INDEX "businesses_price_range_idx" ON "payload"."businesses" USING btree ("price_range");
  CREATE INDEX "_businesses_v_version_amenities_value_idx" ON "payload"."_businesses_v_version_amenities" USING btree ("value");
  CREATE INDEX "_businesses_v_version_subcategories_value_idx" ON "payload"."_businesses_v_version_subcategories" USING btree ("value");
  CREATE INDEX "_businesses_v_version_version_price_range_idx" ON "payload"."_businesses_v" USING btree ("version_price_range");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."businesses_amenities_value_idx";
  DROP INDEX "payload"."businesses_subcategories_value_idx";
  DROP INDEX "payload"."businesses_price_range_idx";
  DROP INDEX "payload"."_businesses_v_version_amenities_value_idx";
  DROP INDEX "payload"."_businesses_v_version_subcategories_value_idx";
  DROP INDEX "payload"."_businesses_v_version_version_price_range_idx";`)
}
