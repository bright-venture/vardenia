import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Two "only one" rules, held by the database instead of by a check before the
 * insert.
 *
 * Both were count-then-insert in application code, which two simultaneous
 * requests pass together:
 *
 * - One fee statement per venue per month. Drawing a month up twice at once
 *   (two clicks, two staff) wrote two statements, and the venue would be billed
 *   twice. A void statement does not count, so a month drawn up wrongly can be
 *   voided and drawn up again - hence the partial index.
 * - One review per customer per listing. Two submissions at once both went in.
 *   Reviews whose customer has since been deleted (customer_id set to null) are
 *   left out; they no longer belong to anyone.
 *
 * Neither database had a duplicate when this was written (checked 13 October
 * 2026), so the indexes build cleanly. The application turns a refusal into the
 * answer the check would have given: "already drawn up" and "already reviewed".
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "statements_one_per_venue_month"
      ON "payload"."statements" ("business_id", "period")
      WHERE "status" <> 'void';
    CREATE UNIQUE INDEX IF NOT EXISTS "reviews_one_per_customer_listing"
      ON "payload"."reviews" ("customer_id", "business_id")
      WHERE "customer_id" IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload"."statements_one_per_venue_month";
    DROP INDEX IF EXISTS "payload"."reviews_one_per_customer_listing";
  `)
}
