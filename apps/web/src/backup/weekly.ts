import path from 'node:path'

/**
 * The weekly full backup: everything Supabase's own backups leave out.
 *
 * # What it is insuring against
 *
 * Supabase backs the database up every night on the Pro plan, keeps seven days
 * and keeps them inside the same account. That leaves three holes:
 *
 * - **The files.** Listing photos and guests' receipts live in Storage, which
 *   no database backup covers. A deleted object is gone.
 * - **The account.** A stolen login, an unpaid card or a closed organization
 *   takes the backups with the database.
 * - **Time.** A mistake noticed after a week has no backup from before it.
 *
 * So once a week this copies the `payload` schema and both buckets to a disk
 * outside Supabase. It is the companion of permanence.ts, which commits the
 * public QR map to the repo every night; this one holds personal data (guests,
 * bookings, receipts), so it must never go near the repo, which is why the CLI
 * refuses an output folder inside it.
 *
 * # Shape on disk
 *
 *   backups/weekly/
 *     2026-11-09/            one folder per run, never changed afterwards
 *       manifest.json        what was copied, row counts, checksums
 *       database/<table>.jsonl
 *       database/_schema.json  columns, enums, sequences, migrations
 *       files/<bucket>.json  every object the bucket held that day
 *     files/<bucket>/...     one shared copy of the objects, only ever added to
 *
 * The objects are shared between runs because a photo never changes once
 * uploaded (its name is random, hooks/unguessableFilename), so copying 800 MB
 * every week would buy nothing. Nothing is ever deleted from that copy: a file
 * removed from Supabase stays here, which is the point. Each run's
 * `files/<bucket>.json` says which objects existed that day.
 *
 * # Why JSON lines and not pg_dump
 *
 * pg_dump is not installed on the machines this runs on, and the schema is
 * already in the repo as migrations. So a restore is: run the migrations up to
 * the one named in the manifest, then insert each table's rows back with
 * `json_populate_record`, which reads every column type Postgres has. Rows are
 * written by `row_to_json`, inside one read-only repeatable-read transaction,
 * so every table is from the same instant.
 */

export const BACKUP_SCHEMA_VERSION = 1

/** The run's folder name: the day in Beirut, which is the day the team means. */
export function runFolderName(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Beirut' })
}

/** Whether `child` is `parent` or anywhere under it. */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Where one object is kept locally, or null for a key that would escape the
 * bucket's folder or that Windows cannot store.
 *
 * Keys are written by our own upload hooks, but a key is still data from
 * outside this process: `../../x` must not write next to the backups.
 */
export function localObjectPath(bucketRoot: string, key: string): string | null {
  if (!key || key.endsWith('/')) return null
  const parts = key.split('/')
  for (const part of parts) {
    if (!part || part === '.' || part === '..') return null
    // Characters Windows refuses in a file name, and control characters.
    if (/[<>:"\\|?*\u0000-\u001f]/.test(part)) return null
    if (/[. ]$/.test(part)) return null
  }
  const target = path.join(bucketRoot, ...parts)
  return isInside(target, bucketRoot) ? target : null
}

/** Whether an object has to be fetched: not here yet, or here at another size. */
export function needsDownload(localSize: number | null, remoteSize: number): boolean {
  return localSize === null || localSize !== remoteSize
}

/** A Postgres identifier, quoted. Table names come from the catalog, never input. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** "799 MB", for the summary. */
export function humanBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export interface RemoteObject {
  key: string
  size: number
  etag: string
  lastModified: string | null
}

export interface BucketSummary {
  files: number
  bytes: number
  downloaded: number
  /** Objects whose key could not be stored safely, listed but not copied. */
  skipped: string[]
  /** New objects left for the next run by `--limit`. */
  remaining: number
  copied: boolean
}

export interface TableSummary {
  rows: number
  sha256: string
}

export interface Manifest {
  backupFormat: typeof BACKUP_SCHEMA_VERSION
  createdAt: string
  source: string | null
  postgres: string
  schema: string
  lastMigration: string | null
  tables: Record<string, TableSummary>
  buckets: Record<string, BucketSummary>
}
