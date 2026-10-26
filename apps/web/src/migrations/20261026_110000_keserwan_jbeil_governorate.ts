import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Keserwan-Jbeil, Lebanon's ninth governorate (see core/regions).
 *
 * Only the new enum value, placed after Mount Lebanon to match the options
 * order. The listings move in the next migration, because Postgres refuses to
 * use an enum value in the transaction that added it, and Payload runs each
 * migration in a transaction of its own.
 *
 * Additive: nothing reads the value until a listing carries it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_businesses_governorate" ADD VALUE IF NOT EXISTS 'keserwan-jbeil' AFTER 'mount-lebanon';
  ALTER TYPE "payload"."enum__businesses_v_version_governorate" ADD VALUE IF NOT EXISTS 'keserwan-jbeil' AFTER 'mount-lebanon';
  ALTER TYPE "payload"."enum_articles_governorate" ADD VALUE IF NOT EXISTS 'keserwan-jbeil' AFTER 'mount-lebanon';
  ALTER TYPE "payload"."enum__articles_v_version_governorate" ADD VALUE IF NOT EXISTS 'keserwan-jbeil' AFTER 'mount-lebanon';`)
}

/**
 * Postgres cannot drop a value from an enum, and rebuilding four types to do
 * it is more risk than an unused value carries. Going down leaves it in place;
 * the next migration's down is what moves the listings back.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {}
