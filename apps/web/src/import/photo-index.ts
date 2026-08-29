import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'
import { checkSeedTarget, databaseIdentity } from '../seed/guard'
import { isDirectory, runPhotoImport } from './photo-import'
import { runPhotoRemove } from './photo-remove'

/**
 * Bulk photograph upload, command line entry point.
 *
 *   pnpm --filter @vardenia/web photos:import photos --credit "Name" --rights supplied --dry-run
 *   pnpm --filter @vardenia/web photos:import photos --credit "Name" --rights supplied
 *
 * Reads the folder tree `photos:folders` produced, one directory per listing,
 * named after the slug. See photo-import.ts for why this is a command and not a
 * screen.
 *
 * # Credit and rights are required, not optional
 *
 * Media has both fields and neither is guessable from a file. Several hundred
 * photographs of real businesses, published on a commercial directory with no
 * record of where they came from, is a liability rather than an untidiness - so
 * the run refuses without them rather than defaulting to something convenient.
 */

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

// The same reason import/index.ts does it: tsx leaves NODE_ENV unset, and
// Payload's `push` is on unless it is 'production'. An unguarded run against a
// live database syncs the schema, which is how production got out of step with
// its migrations once already.
;(process.env as Record<string, string>).NODE_ENV = 'production'

const { default: config } = await import('../payload.config')

const RIGHTS = ['owned', 'licensed', 'supplied'] as const
type Rights = (typeof RIGHTS)[number]

interface Args {
  folder: string | null
  credit: string | null
  rights: Rights | null
  target: string | null
  limit: number | null
  dryRun: boolean
  replace: boolean
  remove: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    folder: null,
    credit: null,
    rights: null,
    target: null,
    limit: null,
    dryRun: false,
    replace: false,
    remove: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => argv[index + 1] ?? ''

    switch (arg) {
      case '--credit':
        args.credit = next()
        index += 1
        break
      case '--rights':
        args.rights = RIGHTS.includes(next() as Rights) ? (next() as Rights) : null
        index += 1
        break
      case '--target':
        args.target = next()
        index += 1
        break
      case '--limit':
        args.limit = Number(next()) || null
        index += 1
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '--replace':
        args.replace = true
        break
      case '--remove':
        args.remove = true
        break
      default:
        if (arg && !arg.startsWith('--') && !args.folder) args.folder = arg
    }
  }

  return args
}

/** Names the database, or refuses. Identical in shape to import/index.ts. */
function assertTarget(stated: string | null): string {
  if (!stated) {
    const result = checkSeedTarget({
      connectionString: process.env.DATABASE_URL,
      allowed: process.env.SEED_ALLOWED_DB,
      // This script sets NODE_ENV itself to stop Payload pushing the schema, so
      // inheriting the seed's rule about it would refuse every database.
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
  '  pnpm --filter @vardenia/web photos:import <folder> --credit "<who>" --rights <owned|licensed|supplied>',
  '  pnpm --filter @vardenia/web photos:import <folder|slug> --remove',
  '',
  'Options:',
  '  --dry-run     work everything out and write nothing',
  '  --limit N     only the first N folders',
  '  --replace     overwrite listings that already have a photograph',
  '  --remove      take the photographs back off and restore the placeholder',
  '  --target ...  name the database, required to reach anything but the default',
].join('\n')

/** Removal, which takes the same folder the upload took. */
async function remove(args: Args, identity: string): Promise<void> {
  const payload = await getPayload({ config })

  const result = await runPhotoRemove(payload, {
    target: path.resolve(args.folder as string),
    dryRun: args.dryRun,
  })

  const lines = [
    args.dryRun ? `Would remove from ${identity}` : `Removed from ${identity}`,
    `  listings named    ${result.slugs}`,
    `  listings changed  ${result.listings}`,
    `  photographs gone  ${result.deleted}`,
  ]

  if (result.notOurs.length > 0) {
    lines.push(
      '',
      `  ${result.notOurs.length} listing(s) left completely alone - the photograph was not`,
      '  uploaded by this tool, so it belongs to somebody else:',
      ...result.notOurs.slice(0, 10).map((n) => `    ${n.slug}  ${n.filename}`),
    )
  }

  if (result.unmatched.length > 0) {
    lines.push(
      '',
      `  ${result.unmatched.length} folder(s) match no listing:`,
      ...result.unmatched.slice(0, 10).map((s) => `    ${s}`),
    )
  }

  if (result.refused.length > 0) {
    lines.push('', `  ${result.refused.length} refused:`)
    for (const entry of result.refused.slice(0, 10)) {
      lines.push(`    ${entry.slug}: ${entry.error}`)
    }
  }

  if (args.dryRun) lines.push('', '  Nothing was written. Run again without --dry-run.')

  console.log(lines.join('\n'))
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (!args.folder) {
    console.error('No folder given.')
    console.error('')
    console.error(USAGE)
    process.exit(1)
  }

  // Removal accepts a single slug as well as a tree, so only the upload needs
  // the argument to be a real directory.
  if (!args.remove && !isDirectory(path.resolve(args.folder))) {
    console.error(`Not a folder: ${args.folder}`)
    console.error('')
    console.error(USAGE)
    process.exit(1)
  }

  if (args.remove) {
    await remove(args, assertTarget(args.target))
    return
  }

  if (!args.credit?.trim() || !args.rights) {
    console.error('--credit and --rights are both required.')
    console.error('')
    console.error('A photograph published with no record of where it came from cannot be')
    console.error('defended later, and neither can be worked out from the file.')
    console.error('')
    console.error(USAGE)
    process.exit(1)
  }

  const identity = assertTarget(args.target)
  const payload = await getPayload({ config })

  const result = await runPhotoImport(payload, {
    root: path.resolve(args.folder),
    credit: args.credit.trim(),
    usageRights: args.rights,
    dryRun: args.dryRun,
    limit: args.limit ?? undefined,
    replace: args.replace,
  })

  const lines = [
    args.dryRun ? `Would upload to ${identity}` : `Uploaded to ${identity}`,
    `  folders read     ${result.folders}`,
    `  listings updated ${result.updated}`,
    `  photographs      ${result.uploaded}`,
    /**
     * Echoed back because it is written onto every photograph and there is no
     * other way to see what arrived. A shell that drops a space turns "Studio
     * Beirut" into "StudioBeirut" on several hundred rows, and the only clue
     * was a quoted argument in the command echo - which nobody reads.
     */
    `  credited to      "${args.credit.trim()}" (${args.rights})`,
  ]

  if (result.skippedExisting.length > 0) {
    lines.push(
      '',
      `  ${result.skippedExisting.length} left alone, already have a photograph:`,
      ...result.skippedExisting.slice(0, 8).map((s) => `    ${s.folder}`),
      ...(result.skippedExisting.length > 8
        ? [`    and ${result.skippedExisting.length - 8} more`]
        : []),
      '  Use --replace to overwrite them.',
    )
  }

  if (result.unmatched.length > 0) {
    lines.push(
      '',
      `  ${result.unmatched.length} folder(s) match no listing:`,
      ...result.unmatched.slice(0, 10).map((f) => `    ${f}`),
      ...(result.unmatched.length > 10 ? [`    and ${result.unmatched.length - 10} more`] : []),
      '  These were renamed, or the listing does not exist yet. Nothing was guessed.',
    )
  }

  if (result.refused.length > 0) {
    lines.push('', `  ${result.refused.length} file(s) the site cannot process:`)
    for (const entry of result.refused.slice(0, 10)) {
      lines.push(`    ${entry.folder}/${entry.file}`, `      ${entry.reason}`)
    }
    if (result.refused.length > 10) lines.push(`    and ${result.refused.length - 10} more`)
  }

  if (result.overflow.length > 0) {
    lines.push('', '  more photographs sent than the listing tier displays:')
    for (const entry of result.overflow.slice(0, 8)) {
      lines.push(`    ${entry.folder}: kept ${entry.kept} of ${entry.sent}`)
    }
    lines.push('  The rest were not uploaded. Upgrade the tier first if they are wanted.')
  }

  if (result.failures.length > 0) {
    lines.push('', `  ${result.failures.length} failed:`)
    for (const failure of result.failures) {
      lines.push(`    ${failure.folder}: ${failure.error}`)
    }
  }

  if (args.dryRun) {
    lines.push('', '  Nothing was written. Run again without --dry-run.')
  }

  console.log(lines.join('\n'))
}

/**
 * Exits explicitly, like import/index.ts does.
 *
 * Payload's connection pool keeps the event loop alive after the work is
 * finished, so without this the command prints its report and then sits there
 * looking like it is still running. Left out of the first version, and it makes
 * a working tool look broken.
 */
main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
