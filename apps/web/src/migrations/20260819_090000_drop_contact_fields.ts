import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Removes every contact field from a listing.
 *
 * Phone, WhatsApp, email, website, reservation link, menu link and the five
 * social profiles. Twenty-two columns in total - eleven on `businesses` and the
 * same eleven again on `_businesses_v`, because drafts keep their own copy of
 * every field.
 *
 * # Why
 *
 * A reader now reaches a business through Vardenia rather than around it.
 * `reservationUrl` was the sharpest case: a listing carrying one sent the
 * customer to a rival booking system, which is the exact thing the bookings
 * work exists to replace. The rest follow from the same decision - if enquiries
 * and reservations happen here, a phone number on the page is a way to leave.
 *
 * # What this costs, stated plainly
 *
 * The social profiles fed `sameAs` in the listing's structured data, which is
 * how Google ties a page to the business as a real-world entity. Dropping them
 * loses that signal. It was a deliberate trade, not an oversight, and it is
 * worth revisiting if listings ever carry a public profile link again.
 *
 * # Not recoverable
 *
 * `down` restores the columns, not their contents. Production holds no listings
 * yet, so nothing is lost today; run this against a populated database and the
 * phone numbers are gone. That is true of any column drop, and worth saying out
 * loud rather than discovering.
 *
 * Every statement is IF EXISTS so a partially-migrated database converges
 * instead of failing - the same reasoning as the Pages removal.
 */

const CONTACT_COLUMNS = [
  'phone',
  'whatsapp',
  'email',
  'website',
  'reservation_url',
  'menu_url',
  'socials_instagram',
  'socials_facebook',
  'socials_tiktok',
  'socials_linkedin',
  'socials_youtube',
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const column of CONTACT_COLUMNS) {
    await db.execute(
      sql.raw(`ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "${column}";`),
    )
    await db.execute(
      sql.raw(`ALTER TABLE "payload"."_businesses_v" DROP COLUMN IF EXISTS "version_${column}";`),
    )
  }
}

/**
 * Shape only. Types match what Payload generated for these fields originally:
 * everything was a text field except `email`, which used the email type and is
 * still varchar underneath.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const column of CONTACT_COLUMNS) {
    await db.execute(
      sql.raw(`ALTER TABLE "payload"."businesses" ADD COLUMN IF NOT EXISTS "${column}" varchar;`),
    )
    await db.execute(
      sql.raw(
        `ALTER TABLE "payload"."_businesses_v" ADD COLUMN IF NOT EXISTS "version_${column}" varchar;`,
      ),
    )
  }
}
