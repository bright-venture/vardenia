import * as migration_20260813_123246_baseline from './20260813_123246_baseline'
import * as migration_20260813_165319_qr_category from './20260813_165319_qr_category'

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
]
