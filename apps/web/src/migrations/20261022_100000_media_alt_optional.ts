import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Media alt text optional (Media `alt`), so photographs can be bulk-uploaded
 * and described afterwards.
 *
 * Down puts the rule back, which fails while any picture has no alt text: fill
 * those in first. Refusing is right; inventing a description is not.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."media_locales" ALTER COLUMN "alt" DROP NOT NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."media_locales" ALTER COLUMN "alt" SET NOT NULL;`)
}
