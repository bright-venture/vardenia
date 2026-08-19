import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Email verification for customer accounts.
 *
 * `auth.verify` on the Customers collection stores two things: whether the
 * address has been proven, and the token in the link that proves it. Public
 * sign-up is what needs them - without verification anyone could open an account
 * under somebody else's address.
 *
 * # Hand-trimmed after generation
 *
 * What came out of `migrate:create` also contained every contact-column drop
 * again - the eleven on `businesses` and the eleven on `_businesses_v` that
 * `20260819_090000_drop_contact_fields` already handles.
 *
 * That is worth understanding rather than just deleting: `migrate:create` diffs
 * the config against the JSON snapshots beside these files, not against the
 * database. The contact removal was written by hand and produced no snapshot, so
 * the generator still believed those columns existed and helpfully offered to
 * drop them a second time - without `IF EXISTS`, which would abort the whole
 * batch on a database where they were already gone.
 *
 * The snapshot written alongside this migration is correct, so the next
 * generation starts from the truth. The lesson stands: a hand-written migration
 * leaves the generator out of step until the next generated one catches up, and
 * its output has to be read rather than trusted.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."customers" ADD COLUMN IF NOT EXISTS "_verified" boolean;
  ALTER TABLE "payload"."customers" ADD COLUMN IF NOT EXISTS "_verificationtoken" varchar;`)
}

/**
 * Existing customers keep their rows and lose only the verification state, which
 * means every account reverts to unproven. That is the honest direction for this
 * to fail in: re-verifying is an email, while a wrongly-trusted address is an
 * account somebody else may control.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."customers" DROP COLUMN IF EXISTS "_verified";
  ALTER TABLE "payload"."customers" DROP COLUMN IF EXISTS "_verificationtoken";`)
}
