import * as migration_20260813_123246_baseline from './20260813_123246_baseline'
import * as migration_20260813_165319_qr_category from './20260813_165319_qr_category'
import * as migration_20260818_122702_drop_pages from './20260818_122702_drop_pages'
import * as migration_20260818_170746_business_accounts from './20260818_170746_business_accounts'
import * as migration_20260818_181551_bookings from './20260818_181551_bookings'
import * as migration_20260818_181600_booking_capacity_trigger from './20260818_181600_booking_capacity_trigger'

/**
 * The order here is the order they run in, and the last two depend on it.
 *
 * `booking_capacity_trigger` installs a trigger on `bookings`, so it must come
 * after `bookings` creates that table. It was originally written as 180000 and
 * `migrate:create` duly listed it *before* the 181551 migration it depends on -
 * the generator sorts by the timestamp in the filename, and Payload stamps that
 * when you ask for a migration rather than when you finish writing one. A
 * hand-written migration can therefore sort ahead of the generated one it needs.
 * Renamed to 181600 so the filename and the dependency agree.
 *
 * If you add a migration by hand, check this list rather than trusting the
 * regeneration: `migrate:create` rewrites this file and will happily reorder
 * things back.
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
]
