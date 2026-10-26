import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Moves every listing in the Keserwan and Jbeil districts from Mount Lebanon to
 * Keserwan-Jbeil, the governorate those districts have belonged to since 2017.
 *
 * The district decides, as it does in the admin: a district is valid only under
 * its own governorate, so a listing left behind would fail its next save.
 * Saved versions move too, so restoring one does not bring back the old pair.
 * Articles carry no district and have no governorate set, so they stay as they
 * are.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "payload"."businesses" SET "governorate" = 'keserwan-jbeil'
    WHERE "district" IN ('keserwan', 'jbeil') AND "governorate" = 'mount-lebanon';
  UPDATE "payload"."_businesses_v" SET "version_governorate" = 'keserwan-jbeil'
    WHERE "version_district" IN ('keserwan', 'jbeil') AND "version_governorate" = 'mount-lebanon';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "payload"."businesses" SET "governorate" = 'mount-lebanon'
    WHERE "governorate" = 'keserwan-jbeil';
  UPDATE "payload"."_businesses_v" SET "version_governorate" = 'mount-lebanon'
    WHERE "version_governorate" = 'keserwan-jbeil';`)
}
