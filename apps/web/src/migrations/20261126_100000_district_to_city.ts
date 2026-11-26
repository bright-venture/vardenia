import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A listing's town is stored as `city` (26 November 2026, the owner's
 * decision). It was `district` since the qada districts became the owner's
 * town list on 24 November; the website already called it a town.
 *
 * A rename in place: the column, its enum type and its index change name, and
 * every value stays where it is. Nothing is copied or dropped.
 *
 * `down` gives the three their old names back.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "payload"."enum_businesses_district" RENAME TO "enum_businesses_city";
  ALTER TABLE "payload"."businesses" RENAME COLUMN "district" TO "city";
  ALTER INDEX "payload"."businesses_district_idx" RENAME TO "businesses_city_idx";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER INDEX "payload"."businesses_city_idx" RENAME TO "businesses_district_idx";
  ALTER TABLE "payload"."businesses" RENAME COLUMN "city" TO "district";
  ALTER TYPE "payload"."enum_businesses_city" RENAME TO "enum_businesses_district";`)
}
