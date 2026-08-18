import * as migration_20260813_123246_baseline from './20260813_123246_baseline';
import * as migration_20260813_165319_qr_category from './20260813_165319_qr_category';
import * as migration_20260818_122702_drop_pages from './20260818_122702_drop_pages';
import * as migration_20260818_170746_business_accounts from './20260818_170746_business_accounts';

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
    name: '20260818_170746_business_accounts'
  },
];
