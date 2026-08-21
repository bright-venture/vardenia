import * as migration_20260813_123246_baseline from './20260813_123246_baseline'
import * as migration_20260813_165319_qr_category from './20260813_165319_qr_category'
import * as migration_20260818_122702_drop_pages from './20260818_122702_drop_pages'
import * as migration_20260818_170746_business_accounts from './20260818_170746_business_accounts'
import * as migration_20260818_181551_bookings from './20260818_181551_bookings'
import * as migration_20260818_181600_booking_capacity_trigger from './20260818_181600_booking_capacity_trigger'
import * as migration_20260819_090000_drop_contact_fields from './20260819_090000_drop_contact_fields'
import * as migration_20260819_090728_customer_verification from './20260819_090728_customer_verification'
import * as migration_20260819_171121_error_events from './20260819_171121_error_events'
import * as migration_20260820_152907_booking_locale from './20260820_152907_booking_locale'
import * as migration_20260820_171943_customer_deleted_at from './20260820_171943_customer_deleted_at'
import * as migration_20260821_130500_filter_indexes from './20260821_130500_filter_indexes'

/**
 * The order here is the order they run in, and two entries depend on it.
 *
 * `booking_capacity_trigger` installs a trigger on `bookings`, so it must come
 * after `bookings` creates that table. It was originally written as 180000 and
 * `migrate:create` duly listed it *before* the 181551 migration it depends on -
 * the generator sorts by the timestamp in the filename, and Payload stamps that
 * when you ask for a migration rather than when you finish writing one. Renamed
 * to 181600 so the filename and the dependency agree.
 *
 * `migrate:create` rewrites this file wholesale and has now deleted this comment
 * four times. Restore it. If you add a migration by hand, re-read the list
 * afterwards rather than trusting the regeneration - and be aware the generator
 * diffs against the JSON snapshots here, not the database, so a hand-written
 * migration leaves it out of step until the next generated one catches up.
 */
export const migrations = [
  {
    up: migration_20260813_123246_baseline.up,
    down: migration_20260813_123246_baseline.down,
    name: '20260813_123246_baseline',
  },
  {
    up: migration_20260813_165319_qr_category.up,
    down: migration_20260813_165319_qr_category.down,
    name: '20260813_165319_qr_category',
  },
  {
    up: migration_20260818_122702_drop_pages.up,
    down: migration_20260818_122702_drop_pages.down,
    name: '20260818_122702_drop_pages',
  },
  {
    up: migration_20260818_170746_business_accounts.up,
    down: migration_20260818_170746_business_accounts.down,
    name: '20260818_170746_business_accounts',
  },
  {
    up: migration_20260818_181551_bookings.up,
    down: migration_20260818_181551_bookings.down,
    name: '20260818_181551_bookings',
  },
  {
    up: migration_20260818_181600_booking_capacity_trigger.up,
    down: migration_20260818_181600_booking_capacity_trigger.down,
    name: '20260818_181600_booking_capacity_trigger',
  },
  {
    up: migration_20260819_090000_drop_contact_fields.up,
    down: migration_20260819_090000_drop_contact_fields.down,
    name: '20260819_090000_drop_contact_fields',
  },
  {
    up: migration_20260819_090728_customer_verification.up,
    down: migration_20260819_090728_customer_verification.down,
    name: '20260819_090728_customer_verification',
  },
  {
    up: migration_20260819_171121_error_events.up,
    down: migration_20260819_171121_error_events.down,
    name: '20260819_171121_error_events',
  },
  {
    up: migration_20260820_152907_booking_locale.up,
    down: migration_20260820_152907_booking_locale.down,
    name: '20260820_152907_booking_locale',
  },
  {
    up: migration_20260820_171943_customer_deleted_at.up,
    down: migration_20260820_171943_customer_deleted_at.down,
    name: '20260820_171943_customer_deleted_at',
  },
  {
    up: migration_20260821_130500_filter_indexes.up,
    down: migration_20260821_130500_filter_indexes.down,
    name: '20260821_130500_filter_indexes',
  },
]
