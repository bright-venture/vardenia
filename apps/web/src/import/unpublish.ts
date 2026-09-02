import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'
import { checkSeedTarget, databaseIdentity } from '../seed/guard'

/**
 * Takes listings off the public site without deleting them.
 *
 *   pnpm --filter @vardenia/web listings:unpublish keep.txt --dry-run
 *   pnpm --filter @vardenia/web listings:unpublish keep.txt --target <user>@<host>/<db>
 *
 * `keep.txt` is one QR code or slug per line - the listings that stay published.
 * Everything else published is set back to draft.
 *
 * # Why unpublish rather than delete
 *
 * Because a code is permanent and a decision about an issue is not. The first
 * issue carries 153 listings; the 155 that are not in it are not wrong, they are
 * just not in this issue, and next issue may well want them. Deleting them
 * destroys the row and strands the code - see hooks/protectPrintedCodes for what
 * that costs once anything is printed.
 *
 * Draft is the reversible version of the same outcome: gone from the directory,
 * gone from search, still there when somebody asks for it back. The listing's
 * own read rule (`publishedStaffOrOwned`) does the hiding, in the database, so
 * nothing depends on this tool being run again to keep them hidden.
 *
 * # Keep-list, not a remove-list
 *
 * The input names what survives. A remove-list that is one line short leaves a
 * listing published and nobody notices; a keep-list that is one line short
 * unpublishes something that should have stayed, which is visible immediately
 * and undone by rerunning with the line added. Both are mistakes - only one of
 * them announces itself.
 *
 * # It goes through Payload, not SQL
 *
 * An UPDATE would be one statement and would skip the version row that drafts
 * depend on, and skip `revalidateListingsAfterChange` - so the directory would
 * keep serving the old set from cache until something else happened to clear
 * it. The point of this tool is what the public sees.
 */

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

// The same reason photo-index.ts does it: tsx leaves NODE_ENV unset, and
// Payload's `push` is on unless it is 'production'. Initialising against a live
// database with push on syncs the schema, which is how production got out of
// step with its migrations once already.
;(process.env as Record<string, string>).NODE_ENV = 'production'

const { default: config } = await import('../payload.config')

interface Args {
  file: string | null
  target: string | null
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { file: null, target: null, dryRun: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--target') {
      args.target = argv[index + 1] ?? ''
      index += 1
    } else if (arg && !arg.startsWith('--') && !args.file) args.file = arg
  }

  return args
}

/** Names the database, or refuses. Identical in shape to photo-index.ts. */
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
        'To reach another database, name it explicitly:',
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

const USAGE = [
  'Usage:',
  '  pnpm --filter @vardenia/web listings:unpublish <keep-file> [--dry-run] [--target <user>@<host>/<db>]',
  '',
  '  <keep-file>   one QR code or slug per line; these stay published.',
  '                Blank lines and lines starting with # are ignored.',
].join('\n')

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.file) {
    console.log(USAGE)
    process.exit(1)
  }

  const identity = assertTarget(args.target)

  /**
   * A code or slug per line, with anything after `#` dropped.
   *
   * The trailing comment is what makes the file reviewable: a list of 153 codes
   * is unreadable, and the whole point of a keep-list is that a person can check
   * it against what they expect to see in the magazine. Names go in the comment.
   */
  const keep = new Set(
    readFileSync(path.resolve(args.file), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.split('#')[0]!.trim())
      .filter(Boolean),
  )

  if (keep.size === 0) throw new Error('The keep list is empty. Refusing to unpublish everything.')

  const payload = await getPayload({ config })

  /**
   * Every published listing, flat. `overrideAccess` because this runs as
   * nobody: there is no session behind a command line.
   *
   * `depth: 0` and an explicit `select`, which is the difference between this
   * finishing and this hanging. At `depth: 1` Payload populates every
   * relationship on all three hundred documents one at a time, and over a
   * pooled connection to another continent that took longer than five minutes
   * before it was killed. The codes are fetched below in a single second query.
   */
  const found = await payload.find({
    collection: 'businesses',
    where: { _status: { equals: 'published' } },
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { name: true, slug: true, qrCode: true },
  })

  const idOf = (value: unknown): number | string | null => {
    if (typeof value === 'number' || typeof value === 'string') return value
    const id = (value as { id?: unknown } | null)?.id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }

  const codeIds = found.docs
    .map((doc) => idOf((doc as { qrCode?: unknown }).qrCode))
    .filter((id): id is number | string => id !== null)

  const codes = new Map<string, string>()
  if (codeIds.length > 0) {
    const qr = await payload.find({
      collection: 'qr-codes',
      where: { id: { in: codeIds } },
      limit: codeIds.length,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { code: true },
    })
    for (const doc of qr.docs)
      codes.set(String(doc.id), String((doc as { code?: unknown }).code ?? ''))
  }

  const rows = found.docs.map((doc) => {
    const codeId = idOf((doc as { qrCode?: unknown }).qrCode)
    return {
      id: doc.id,
      name: String((doc as { name?: unknown }).name ?? ''),
      slug: String((doc as { slug?: unknown }).slug ?? ''),
      code: codeId === null ? '' : (codes.get(String(codeId)) ?? ''),
    }
  })

  const staying = rows.filter((r) => keep.has(r.code) || keep.has(r.slug))
  const going = rows.filter((r) => !keep.has(r.code) && !keep.has(r.slug))

  /**
   * Lines in the keep list that matched nothing published. Reported rather than
   * ignored: it usually means a typo or a listing that is already a draft, and
   * silently keeping 152 when you asked for 153 is the failure this tool must
   * not have.
   */
  const seen = new Set(rows.flatMap((r) => [r.code, r.slug].filter(Boolean)))
  const unmatched = [...keep].filter((k) => !seen.has(k))

  console.log(`${args.dryRun ? 'Would unpublish on' : 'Unpublishing on'} ${identity}`)
  console.log(`  published now     ${rows.length}`)
  console.log(`  keep list         ${keep.size}`)
  console.log(`  staying published ${staying.length}`)
  console.log(`  to unpublish      ${going.length}`)

  if (unmatched.length > 0) {
    console.log('')
    console.log(`  ${unmatched.length} keep-list entr(ies) matched nothing published:`)
    for (const u of unmatched.slice(0, 20)) console.log(`    ${u}`)
  }

  if (args.dryRun) {
    console.log('')
    console.log('  first 10 that would go:')
    for (const r of going.slice(0, 10)) console.log(`    ${r.code || '(no code)'}  ${r.name}`)
    console.log('')
    console.log('  Nothing was written. Run again without --dry-run.')
    return
  }

  let done = 0
  const failed: { slug: string; error: string }[] = []

  for (const row of going) {
    try {
      await payload.update({
        collection: 'businesses',
        id: row.id,
        // Through Payload so the version row is written and the directory cache
        // is cleared. See the note at the top.
        data: { _status: 'draft' },
        overrideAccess: true,
      })
      done += 1
    } catch (error) {
      failed.push({ slug: row.slug, error: error instanceof Error ? error.message : String(error) })
    }
  }

  console.log('')
  console.log(`  unpublished       ${done}`)
  if (failed.length > 0) {
    console.log(`  failed            ${failed.length}`)
    for (const f of failed.slice(0, 10)) console.log(`    ${f.slug}: ${f.error}`)
  }
}

await main()

/**
 * Ends the process, rather than waiting for the event loop to drain.
 *
 * `getPayload` opens a connection pool and nothing closes it, so the script
 * finishes its work and then sits there. Harmless on its own and actively
 * misleading here: the first run of this printed a complete, correct report and
 * was then killed by a timeout, which reads exactly like a hang partway through
 * a write. A command that changes production has to say when it is done.
 */
process.exit(0)
