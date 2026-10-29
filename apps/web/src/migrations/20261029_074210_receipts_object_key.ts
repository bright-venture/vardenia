import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The storage key column on receipts, which media has had since Payload 3.90.
 *
 * The storage plugin adds an `_objectKey` field to every collection it stores,
 * and 20261029_071140_receipts was generated with the receipts bucket not yet
 * configured, so the plugin had not run and the column was left out. Once the
 * bucket is set, every read of a receipt (and of a booking that shows one)
 * asks for it. Receipts now declares the field itself, so the schema no longer
 * depends on the environment. Additive.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."receipts" ADD COLUMN "_objectkey" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."receipts" DROP COLUMN "_objectkey";`)
}
