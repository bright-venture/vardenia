import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses" ADD COLUMN "payments_cash" boolean DEFAULT false;
  ALTER TABLE "payload"."businesses" ADD COLUMN "payments_card" boolean DEFAULT false;
  ALTER TABLE "payload"."businesses" ADD COLUMN "payments_whish" boolean DEFAULT false;
  ALTER TABLE "payload"."businesses" ADD COLUMN "payments_omt" boolean DEFAULT false;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_payments_cash" boolean DEFAULT false;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_payments_card" boolean DEFAULT false;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_payments_whish" boolean DEFAULT false;
  ALTER TABLE "payload"."_businesses_v" ADD COLUMN "version_payments_omt" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."businesses" DROP COLUMN "payments_cash";
  ALTER TABLE "payload"."businesses" DROP COLUMN "payments_card";
  ALTER TABLE "payload"."businesses" DROP COLUMN "payments_whish";
  ALTER TABLE "payload"."businesses" DROP COLUMN "payments_omt";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_payments_cash";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_payments_card";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_payments_whish";
  ALTER TABLE "payload"."_businesses_v" DROP COLUMN "version_payments_omt";`)
}
