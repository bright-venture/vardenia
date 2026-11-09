import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The "Pause new accounts" switch on the Settings page (lib/signups), added on
 * 6 November 2026. Additive, and false by default, so sign-ups stay open until
 * an admin ticks it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."settings" ADD COLUMN "signups_paused" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."settings" DROP COLUMN "signups_paused";`)
}
