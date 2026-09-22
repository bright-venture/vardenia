import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Move the gyms and the malls onto the subcategories they should always have had.
 *
 * The migration before this one added `gyms` and `malls` to the enum. Postgres
 * will not let a value be used in the transaction that added it, so the rows
 * move here, in the next one.
 *
 * # What moves, and why it is safe to move all of it
 *
 * Every row carrying `wellness` was checked before this was written, and all of
 * them are fitness clubs - "Apex Gym Lebanon", "Xfit Gym", "Roots Pilates
 * Studio". Not one is a spa. The same is true of `luxury-shopping`: all of them
 * are shopping centres or outlets. So this is a blanket move rather than a
 * hand-picked list, and the checked-ness of that is the reason.
 *
 * `wellness` and `luxury-shopping` both stay in the taxonomy. A spa genuinely
 * belongs under healthcare and a jeweller genuinely belongs under luxury
 * shopping; they are simply empty until somebody files one there.
 *
 * # The category moves too
 *
 * A gym was `healthcare`, which is the section holding hospitals and clinics.
 * Changing the subcategory alone would leave fifty fitness clubs answering the
 * Health section's filters. Malls were already `lifestyle`, so only their
 * subcategory changes.
 *
 * # Versions are left alone
 *
 * Only the live rows are rewritten. A draft version is a record of what the
 * document said at the time, and rewriting history to match a later decision
 * would make the version list lie about what was published.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "payload"."businesses_subcategories"
       SET "value" = 'gyms'
     WHERE "value" = 'wellness';

    UPDATE "payload"."businesses_subcategories"
       SET "value" = 'malls'
     WHERE "value" = 'luxury-shopping';

    UPDATE "payload"."businesses" b
       SET "category" = 'lifestyle'
     WHERE "category" = 'healthcare'
       AND EXISTS (
         SELECT 1 FROM "payload"."businesses_subcategories" s
          WHERE s."parent_id" = b."id" AND s."value" = 'gyms'
       );
  `)
}

/**
 * Sends them back where they came from.
 *
 * Lossy in one direction that cannot be helped: a listing filed under
 * `healthcare` that was never a gym is indistinguishable from one that was,
 * once `up` has run. At the time of writing there were none - every `wellness`
 * row was a gym - so rolling back restores the previous state exactly.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "payload"."businesses" b
       SET "category" = 'healthcare'
     WHERE "category" = 'lifestyle'
       AND EXISTS (
         SELECT 1 FROM "payload"."businesses_subcategories" s
          WHERE s."parent_id" = b."id" AND s."value" = 'gyms'
       );

    UPDATE "payload"."businesses_subcategories"
       SET "value" = 'wellness'
     WHERE "value" = 'gyms';

    UPDATE "payload"."businesses_subcategories"
       SET "value" = 'luxury-shopping'
     WHERE "value" = 'malls';
  `)
}
