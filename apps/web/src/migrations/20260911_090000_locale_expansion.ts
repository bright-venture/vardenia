import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Widen content localization from English and Arabic to all ten UI locales.
 *
 * The CMS now localizes over every locale the switcher offers (see the
 * localization block in payload.config), so the shared `_locales` enum and the
 * two draft-collection `published_locale` enums gain the eight new values. Most
 * fields are still only written in English and Arabic; `fallback: true` renders
 * the rest in English, so nothing breaks before translations are entered.
 *
 * `ADD VALUE` is the whole of `up`, matching the pattern in the import-batch
 * migration. Postgres cannot drop an enum value, so `down` rebuilds each type at
 * its original two values, first removing the localized rows in the new locales
 * (which is exactly the state this migration rolls back to - before them, only
 * English and Arabic rows existed).
 */

const NEW_LOCALES = ['fr', 'es', 'pt', 'ru', 'zh', 'hi', 'bn', 'ur']

// Every table whose `_locale` column is the shared `payload._locales` enum.
const LOCALE_TABLES = [
  'businesses_locales',
  '_businesses_v_locales',
  'articles_locales',
  '_articles_v_locales',
  'issues_locales',
  'media_locales',
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const targets = [
    '_locales',
    'enum__businesses_v_published_locale',
    'enum__articles_v_published_locale',
  ]
  const statements = targets
    .flatMap((type) =>
      NEW_LOCALES.map(
        (value) => `ALTER TYPE "payload"."${type}" ADD VALUE IF NOT EXISTS '${value}';`,
      ),
    )
    .join('\n  ')
  await db.execute(sql.raw(statements))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const list = NEW_LOCALES.map((v) => `'${v}'`).join(', ')

  // Drop the rows that could only exist because of this migration.
  const deletes = LOCALE_TABLES.map(
    (t) => `DELETE FROM "payload"."${t}" WHERE "_locale" IN (${list});`,
  ).join('\n  ')

  // Rebuild the shared _locales enum at its original two values.
  const toText = LOCALE_TABLES.map(
    (t) => `ALTER TABLE "payload"."${t}" ALTER COLUMN "_locale" SET DATA TYPE text;`,
  ).join('\n  ')
  const toEnum = LOCALE_TABLES.map(
    (t) =>
      `ALTER TABLE "payload"."${t}" ALTER COLUMN "_locale" SET DATA TYPE "payload"."_locales" USING "_locale"::"payload"."_locales";`,
  ).join('\n  ')

  await db.execute(
    sql.raw(`
  ${deletes}

  ${toText}
  DROP TYPE "payload"."_locales";
  CREATE TYPE "payload"."_locales" AS ENUM('en', 'ar');
  ${toEnum}

  UPDATE "payload"."_businesses_v" SET "published_locale" = NULL WHERE "published_locale" IN (${list});
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "published_locale" SET DATA TYPE text;
  DROP TYPE "payload"."enum__businesses_v_published_locale";
  CREATE TYPE "payload"."enum__businesses_v_published_locale" AS ENUM('en', 'ar');
  ALTER TABLE "payload"."_businesses_v" ALTER COLUMN "published_locale" SET DATA TYPE "payload"."enum__businesses_v_published_locale" USING "published_locale"::"payload"."enum__businesses_v_published_locale";

  UPDATE "payload"."_articles_v" SET "published_locale" = NULL WHERE "published_locale" IN (${list});
  ALTER TABLE "payload"."_articles_v" ALTER COLUMN "published_locale" SET DATA TYPE text;
  DROP TYPE "payload"."enum__articles_v_published_locale";
  CREATE TYPE "payload"."enum__articles_v_published_locale" AS ENUM('en', 'ar');
  ALTER TABLE "payload"."_articles_v" ALTER COLUMN "published_locale" SET DATA TYPE "payload"."enum__articles_v_published_locale" USING "published_locale"::"payload"."enum__articles_v_published_locale";`),
  )
}
