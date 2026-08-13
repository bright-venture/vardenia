import * as migration_20260813_123246_baseline from './20260813_123246_baseline'

export const migrations = [
  {
    up: migration_20260813_123246_baseline.up,
    down: migration_20260813_123246_baseline.down,
    name: '20260813_123246_baseline',
  },
]
