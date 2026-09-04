import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'
import { DB_SCHEMA } from '../lib/db'
import { checkSeedTarget, databaseIdentity } from '../seed/guard'
import { BACKUP_RELATIVE, restorePermanence, type PermanenceFile } from './permanence'

/**
 * Rebuilds the code rows from the backup file.
 *
 *   pnpm --filter @vardenia/web backup:restore                       # dry run
 *   pnpm --filter @vardenia/web backup:restore --write --target <user>@<host>/<db>
 *
 * # Dry run by default
 *
 * This is the tool you reach for on the worst day, so it does nothing until told
 * to. Without --write it runs the whole restore inside a transaction and rolls it
 * back, printing exactly what it would have done. That preview is not a separate
 * code path: the real run is the identical thing with COMMIT instead of ROLLBACK,
 * which is what the integration test exercises.
 *
 * # It names the database out loud
 *
 * A restore writes, and the one that matters writes to production. So, like the
 * unpublish tool, it refuses to run against a database you have not named:
 * either SEED_ALLOWED_DB matches (the development case) or you pass
 * --target and it must equal what DATABASE_URL actually points at. There is no
 * flag that says "whatever it is, go".
 *
 * # Restore the listings first
 *
 * A code points at a listing by slug. If the slug matches nothing, the code is
 * skipped and reported, and --write refuses to commit a half-restore. So the
 * order on a full rebuild is: bring the businesses, articles and issues back
 * (re-import, or restore them separately), then run this. See backups/README.md
 * for the whole sequence, including what to do about codes a re-import minted.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../')

loadEnv({ path: path.join(ROOT, '.env') })

interface Args {
  write: boolean
  target: string | null
  file: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { write: false, target: null, file: path.join(ROOT, BACKUP_RELATIVE) }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--write') args.write = true
    else if (arg === '--target') {
      args.target = argv[i + 1] ?? ''
      i += 1
    } else if (arg === '--file') {
      args.file = path.resolve(argv[i + 1] ?? '')
      i += 1
    }
  }
  return args
}

/** Names the database, or refuses. Same shape as import/unpublish.ts. */
function assertTarget(stated: string | null): string {
  if (!stated) {
    const result = checkSeedTarget({
      connectionString: process.env.DATABASE_URL,
      allowed: process.env.SEED_ALLOWED_DB,
      nodeEnv: undefined,
    })
    if (result.ok) return result.identity

    throw new Error(
      [
        'Refusing to run.',
        '',
        result.reason,
        '',
        `DATABASE_URL currently points at: ${result.identity ?? '(unidentifiable)'}`,
        '',
        'To restore into another database, name it explicitly:',
        '',
        '  --target <user>@<host>/<database>',
      ].join('\n'),
    )
  }

  const actual = databaseIdentity(process.env.DATABASE_URL)
  if (!actual) throw new Error('DATABASE_URL is not set or could not be parsed.')

  if (stated.trim().toLowerCase() !== actual) {
    throw new Error(
      [
        'Refusing to run.',
        '',
        '--target does not match the database DATABASE_URL points at.',
        `  you said:  ${stated}`,
        `  it is:     ${actual}`,
      ].join('\n'),
    )
  }

  return actual
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const identity = assertTarget(args.target)

  const file = JSON.parse(readFileSync(args.file, 'utf8')) as PermanenceFile
  if (!Array.isArray(file.codes)) {
    throw new Error(`${args.file} does not look like a permanence backup.`)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  })

  console.log(`${args.write ? 'Restoring into' : 'Dry run against'} ${identity}`)
  console.log(`  backup          ${path.relative(ROOT, args.file)} (${file.codes.length} codes)`)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await restorePermanence(client, file, DB_SCHEMA)

    console.log(`  would insert    ${result.inserted}`)
    console.log(`  would update    ${result.updated}`)
    console.log(`  would relink    ${result.relinked}`)
    console.log(`  unresolved      ${result.unresolved.length}`)

    if (result.unresolved.length > 0) {
      console.log('')
      console.log('  slugs that match no listing (restore the listings first):')
      for (const u of result.unresolved.slice(0, 20))
        console.log(`    ${u.code}  (${u.targetType})  ${u.slug}`)
      if (result.unresolved.length > 20)
        console.log(`    ...and ${result.unresolved.length - 20} more`)
    }

    if (args.write && result.unresolved.length === 0) {
      await client.query('COMMIT')
      console.log('')
      console.log('  committed.')
    } else {
      await client.query('ROLLBACK')
      console.log('')
      if (args.write) {
        // --write was asked for, but a half-restore is worse than none.
        console.log('  rolled back: some slugs did not resolve. Restore the listings, then rerun.')
        process.exitCode = 1
      } else {
        console.log('  rolled back (dry run). Rerun with --write to commit.')
      }
    }
  } finally {
    client.release()
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
