import { createHash } from 'node:crypto'
import { editionsBucket } from '../lib/storage-base'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseEnv } from 'dotenv'
import { Client } from 'pg'
import type { KeyObject } from 'node:crypto'
import { DB_SCHEMA } from '../lib/db'
import { ENCRYPTED_SUFFIX, encryptBytes, readPublicKey } from './crypto'
import { databaseSsl } from '../lib/db-ssl'
import { databaseIdentity } from '../seed/guard'
import {
  BACKUP_SCHEMA_VERSION,
  type BucketSummary,
  type Manifest,
  type RemoteObject,
  type TableSummary,
  humanBytes,
  isInside,
  localObjectPath,
  needsDownload,
  quoteIdent,
  runFolderName,
} from './weekly'

/**
 * Copies production's database and its Storage buckets to a disk outside
 * Supabase. See weekly.ts for why and for the layout.
 *
 *   pnpm --filter @vardenia/web backup:weekly
 *   pnpm --filter @vardenia/web backup:weekly --skip-files
 *   pnpm --filter @vardenia/web backup:weekly --list-files
 *   pnpm --filter @vardenia/web backup:weekly --limit 500
 *   pnpm --filter @vardenia/web backup:weekly --env .env.prod --out D:/vardenia-backups
 *
 * Read-only on both sides: the database is read in a READ ONLY transaction and
 * the buckets are only listed and downloaded. Settings come from `.env.prod` at
 * the repo root by default, read into this process only, never into the
 * environment of anything it starts.
 *
 * The first run copies every photo (about 800 MB) and takes a while; later runs
 * fetch only what is new. An interrupted run leaves a `.partial` folder and the
 * objects it had already fetched, and the next run carries on from there.
 * `--limit` fetches at most that many new files in one run, for a slow
 * connection: the rest come with the next run, and the summary says how many
 * are still to fetch.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../')

interface Options {
  envFile: string
  out: string
  files: 'all' | 'list' | 'none'
  /** At most this many new objects per bucket this run; the rest next time. */
  limit: number
}

function readOptions(argv: string[]): Options {
  const value = (flag: string) => {
    const at = argv.indexOf(flag)
    return at >= 0 ? argv[at + 1] : undefined
  }
  return {
    envFile: path.resolve(ROOT, value('--env') ?? '.env.prod'),
    out: path.resolve(value('--out') ?? path.join(ROOT, '..', 'backups', 'weekly')),
    files: argv.includes('--skip-files') ? 'none' : argv.includes('--list-files') ? 'list' : 'all',
    limit: Math.max(0, Number(value('--limit')) || 0) || Infinity,
  }
}

// ---------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------

async function exportDatabase(
  env: Record<string, string>,
  folder: string,
  publicKey: KeyObject,
): Promise<Pick<Manifest, 'source' | 'postgres' | 'lastMigration' | 'tables'>> {
  const connectionString = env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set in the env file.')

  const client = new Client({
    connectionString,
    ssl: databaseSsl(env),
    connectionTimeoutMillis: 15_000,
  })
  await client.connect()
  const source = databaseIdentity(connectionString)
  console.log(`Reading ${source ?? '(unidentifiable database)'}`)

  const dir = path.join(folder, 'database')
  mkdirSync(dir, { recursive: true })
  const tables: Record<string, TableSummary> = {}

  try {
    // One snapshot for every table, so a booking and its statement line are
    // from the same instant. READ ONLY: this cannot change anything.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')

    const postgres = String((await client.query('SHOW server_version')).rows[0]?.server_version)
    const names = (
      await client.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
        [DB_SCHEMA],
      )
    ).rows.map((row) => String(row.table_name))

    for (const name of names) {
      const hash = createHash('sha256')
      const lines: string[] = []
      // A cursor, so a large table comes over in pieces and not as one reply.
      await client.query(
        `DECLARE dump NO SCROLL CURSOR FOR
           SELECT row_to_json(t)::text AS row FROM ${quoteIdent(DB_SCHEMA)}.${quoteIdent(name)} t`,
      )
      for (;;) {
        const batch = await client.query('FETCH 1000 FROM dump')
        if (batch.rows.length === 0) break
        for (const row of batch.rows) lines.push(String(row.row))
      }
      await client.query('CLOSE dump')
      const body = lines.length > 0 ? `${lines.join('\n')}\n` : ''
      hash.update(body)
      // Locked as it is written: the rows never touch the disk in plain.
      // The checksum is of the plain rows, so a restore can check them once opened.
      writeFileSync(
        path.join(dir, `${name}.jsonl${ENCRYPTED_SUFFIX}`),
        encryptBytes(Buffer.from(body), publicKey),
      )
      tables[name] = { rows: lines.length, sha256: hash.digest('hex') }
    }

    // What a restore needs besides the rows: the columns to check against,
    // the enums, where each id sequence stood, and the migrations applied.
    const columns = await client.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns WHERE table_schema = $1
        ORDER BY table_name, ordinal_position`,
      [DB_SCHEMA],
    )
    const enums = await client.query(
      `SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1 GROUP BY t.typname ORDER BY t.typname`,
      [DB_SCHEMA],
    )
    const sequences = await client.query(
      `SELECT sequencename AS name, last_value FROM pg_sequences
        WHERE schemaname = $1 ORDER BY sequencename`,
      [DB_SCHEMA],
    )
    const migrations = names.includes('payload_migrations')
      ? await client.query(
          `SELECT name, batch FROM ${quoteIdent(DB_SCHEMA)}.payload_migrations ORDER BY id`,
        )
      : { rows: [] as Record<string, unknown>[] }

    await client.query('COMMIT')

    writeFileSync(
      path.join(dir, '_schema.json'),
      `${JSON.stringify(
        {
          schema: DB_SCHEMA,
          columns: columns.rows,
          enums: enums.rows,
          sequences: sequences.rows,
          migrations: migrations.rows,
        },
        null,
        1,
      )}\n`,
    )

    const last = migrations.rows.at(-1)
    return {
      source,
      postgres,
      lastMigration: last ? String(last.name) : null,
      tables,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// The buckets
// ---------------------------------------------------------------------------

/* The S3 client the storage plugin already ships with, loaded from its own
 * folder: no second copy of the SDK in the lockfile for one script. Typed
 * here to the four calls this uses. */
interface S3Like {
  send(command: unknown): Promise<unknown>
}
interface S3Module {
  S3Client: new (config: unknown) => S3Like
  ListObjectsV2Command: new (input: unknown) => unknown
  GetObjectCommand: new (input: unknown) => unknown
}

function loadS3(): S3Module {
  const plugin = realpathSync(path.join(ROOT, 'apps/web/node_modules/@payloadcms/storage-s3'))
  return createRequire(path.join(plugin, 'package.json'))('@aws-sdk/client-s3') as S3Module
}

async function listBucket(s3: S3Like, mod: S3Module, bucket: string): Promise<RemoteObject[]> {
  const objects: RemoteObject[] = []
  let token: string | undefined
  do {
    const page = (await s3.send(
      new mod.ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }),
    )) as {
      Contents?: { Key?: string; Size?: number; ETag?: string; LastModified?: Date }[]
      NextContinuationToken?: string
      IsTruncated?: boolean
    }
    for (const item of page.Contents ?? []) {
      if (!item.Key) continue
      objects.push({
        key: item.Key,
        size: Number(item.Size ?? 0),
        etag: String(item.ETag ?? '').replace(/"/g, ''),
        lastModified: item.LastModified ? item.LastModified.toISOString() : null,
      })
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return objects
}

async function copyBucket(
  s3: S3Like,
  mod: S3Module,
  bucket: string,
  objects: RemoteObject[],
  bucketRoot: string,
  limit: number,
  publicKey: KeyObject,
): Promise<{ downloaded: number; skipped: string[]; remaining: number }> {
  const skipped: string[] = []
  const todo: { object: RemoteObject; target: string }[] = []
  for (const object of objects) {
    const target = localObjectPath(bucketRoot, object.key)
    if (!target) {
      skipped.push(object.key)
      continue
    }
    // Locked copies are written aside and renamed, so one that exists is
    // whole. A plain copy from before encryption still counts until
    // `backup:keys encrypt-existing` locks it.
    if (existsSync(`${target}${ENCRYPTED_SUFFIX}`)) continue
    const localSize = existsSync(target) ? statSync(target).size : null
    if (needsDownload(localSize, object.size)) todo.push({ object, target })
  }

  const remaining = Math.max(0, todo.length - limit)
  if (remaining > 0) todo.length = limit
  console.log(`  ${bucket}: fetching ${todo.length} of ${objects.length}`)
  let done = 0
  let next = 0
  const worker = async () => {
    while (next < todo.length) {
      const { object, target } = todo[next++]!
      const reply = (await s3.send(
        new mod.GetObjectCommand({ Bucket: bucket, Key: object.key }),
      )) as {
        Body?: { transformToByteArray(): Promise<Uint8Array> }
      }
      if (!reply.Body) throw new Error(`${bucket}/${object.key}: empty reply`)
      const bytes = await reply.Body.transformToByteArray()
      mkdirSync(path.dirname(target), { recursive: true })
      // Locked before it is written, then written aside and renamed, so a file
      // cut off mid-write is never mistaken for a finished one next time.
      const locked = `${target}${ENCRYPTED_SUFFIX}`
      writeFileSync(`${locked}.part`, encryptBytes(bytes, publicKey))
      renameSync(`${locked}.part`, locked)
      done += 1
      if (done % 250 === 0) console.log(`    ${done} / ${todo.length}`)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  return { downloaded: done, skipped, remaining }
}

async function exportBuckets(
  env: Record<string, string>,
  out: string,
  folder: string,
  mode: Options['files'],
  limit: number,
  publicKey: KeyObject,
): Promise<Record<string, BucketSummary>> {
  // Photos, receipts, and the magazine PDFs (collections/Editions).
  const buckets = [env.S3_BUCKET, env.S3_RECEIPTS_BUCKET, editionsBucket(env)]
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name))
  if (mode === 'none') return {}
  if (!env.S3_ENDPOINT || buckets.length === 0) {
    throw new Error('S3_ENDPOINT and S3_BUCKET must be set in the env file to copy the files.')
  }

  const mod = loadS3()
  const s3 = new mod.S3Client({
    region: env.S3_REGION || 'auto',
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })

  mkdirSync(path.join(folder, 'files'), { recursive: true })
  const summary: Record<string, BucketSummary> = {}
  for (const bucket of buckets) {
    const objects = await listBucket(s3, mod, bucket)
    writeFileSync(
      path.join(folder, 'files', `${bucket}.json`),
      `${JSON.stringify(objects, null, 1)}\n`,
    )
    const bytes = objects.reduce((sum, object) => sum + object.size, 0)
    const copied =
      mode === 'all'
        ? await copyBucket(
            s3,
            mod,
            bucket,
            objects,
            path.join(out, 'files', bucket),
            limit,
            publicKey,
          )
        : { downloaded: 0, skipped: [], remaining: 0 }
    summary[bucket] = {
      files: objects.length,
      bytes,
      downloaded: copied.downloaded,
      skipped: copied.skipped,
      remaining: copied.remaining,
      copied: mode === 'all',
    }
  }
  return summary
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2))

  // Guests, bookings and receipts: never inside the repository, whose
  // `backups/` folder is committed and pushed.
  if (isInside(options.out, ROOT)) {
    throw new Error(
      `Refusing to write personal data inside the repository (${options.out}). ` +
        'Pick a folder outside it with --out.',
    )
  }
  if (!existsSync(options.envFile)) throw new Error(`No env file at ${options.envFile}.`)
  const env = parseEnv(readFileSync(options.envFile))

  /**
   * Nothing is written without the public key: the backup holds guests'
   * personal data and receipts, and a plain copy on a disk is what encryption
   * was added to stop (9 November 2026). Make the keys with
   * `backup:keys keygen` and put the public one in the env file.
   */
  if (!env.BACKUP_PUBLIC_KEY?.trim()) {
    throw new Error(
      'BACKUP_PUBLIC_KEY is not set in the env file, so the backup cannot be encrypted. ' +
        'Create the keys with: pnpm --filter @vardenia/web backup:keys keygen --private <file>',
    )
  }
  const publicKey = readPublicKey(env.BACKUP_PUBLIC_KEY)

  const now = new Date()
  let name = runFolderName(now)
  for (let n = 2; existsSync(path.join(options.out, name)); n += 1) {
    name = `${runFolderName(now)}-${n}`
  }
  const partial = path.join(options.out, `${name}.partial`)
  mkdirSync(partial, { recursive: true })

  console.log(`Weekly backup into ${path.join(options.out, name)}`)
  const database = await exportDatabase(env, partial, publicKey)
  const rows = Object.values(database.tables).reduce((sum, table) => sum + table.rows, 0)
  console.log(`  database: ${Object.keys(database.tables).length} tables, ${rows} rows`)
  console.log(`  last migration: ${database.lastMigration ?? 'none'}`)

  if (options.files !== 'none') console.log('Files')
  const buckets = await exportBuckets(
    env,
    options.out,
    partial,
    options.files,
    options.limit,
    publicKey,
  )

  const manifest: Manifest = {
    backupFormat: BACKUP_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    schema: DB_SCHEMA,
    ...database,
    buckets,
  }
  writeFileSync(path.join(partial, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
  renameSync(partial, path.join(options.out, name))

  console.log('')
  for (const [bucket, b] of Object.entries(buckets)) {
    const state = b.copied ? `${b.downloaded} fetched this run` : 'listed only, not copied'
    console.log(`  ${bucket}: ${b.files} files, ${humanBytes(b.bytes)} (${state})`)
    if (b.remaining > 0) console.log(`    ${b.remaining} still to fetch: run it again`)
    if (b.skipped.length > 0)
      console.log(`    ${b.skipped.length} with a key that cannot be stored`)
  }
  console.log(`Done: ${path.join(options.out, name)}`)
  console.log('Encrypted: it opens only with the private key (Desktop\\Vardenia\\backup-key).')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
