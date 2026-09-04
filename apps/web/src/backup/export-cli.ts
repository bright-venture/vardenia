import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'
import { DB_SCHEMA } from '../lib/db'
import { databaseIdentity } from '../seed/guard'
import { BACKUP_RELATIVE, exportPermanence, findDrift, serialize } from './permanence'

/**
 * Writes the permanence layer to backups/qr-permanence.json.
 *
 *   pnpm --filter @vardenia/web backup:export
 *   pnpm --filter @vardenia/web backup:export --allow-drift
 *
 * Read-only, so unlike the seed and the unpublish tool it needs no target guard:
 * it cannot change anything whatever DATABASE_URL points at. It still prints the
 * database it read, so a run against the wrong one is obvious in the log.
 *
 * # It fails on drift
 *
 * If a printed code no longer resolves to what it claims - a listing deleted, a
 * slug changed out from under it - the export exits non-zero and writes nothing.
 * That is the point of running it nightly: the failure is the alarm. A code that
 * has silently stopped working is the one thing this product cannot ship, and a
 * backup that recorded the breakage as if it were the normal state would be worse
 * than no backup. `--allow-drift` writes the file anyway, for the rare case where
 * the drift is known and being fixed and a snapshot is still wanted.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../')

loadEnv({ path: path.join(ROOT, '.env') })

async function main(): Promise<void> {
  const allowDrift = process.argv.slice(2).includes('--allow-drift')

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set.')

  const pool = new Pool({
    connectionString,
    // Supabase's certificate chain is not one Node ships; the connection is still
    // encrypted. Same setting the Payload adapter and lib/qr-fast use.
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  })

  console.log(`Reading ${databaseIdentity(connectionString) ?? '(unidentifiable database)'}`)

  const file = await exportPermanence(pool, DB_SCHEMA)
  const drift = findDrift(file)

  console.log(`  codes           ${file.count}`)
  console.log(`  drift           ${drift.length}`)

  if (drift.length > 0) {
    console.log('')
    console.log('  codes that no longer resolve:')
    for (const d of drift.slice(0, 20))
      console.log(`    ${d.code}  (${d.targetType}) missing ${d.missing}`)
    if (drift.length > 20) console.log(`    ...and ${drift.length - 20} more`)

    if (!allowDrift) {
      console.log('')
      throw new Error(
        `${drift.length} printed code(s) no longer resolve. Nothing was written. ` +
          'Fix the targets, or pass --allow-drift to snapshot anyway.',
      )
    }
    console.log('')
    console.log('  --allow-drift: writing the snapshot anyway.')
  }

  const out = path.join(ROOT, BACKUP_RELATIVE)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, serialize(file))

  console.log('')
  console.log(`  wrote ${path.relative(ROOT, out)}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
