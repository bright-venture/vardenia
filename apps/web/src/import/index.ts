import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'
import { assertSeedTarget, databaseIdentity } from '../seed/guard'
import { runImport } from './run'
import { describeImport, removeImport } from './remove'
import { clearListings, resetContent } from './clear'

/**
 * Bulk listing import, command line entry point.
 *
 *   pnpm import:listings <file.csv> --batch keserwan-2026-08
 *   pnpm import:listings <file.csv> --batch keserwan-2026-08 --dry-run
 *   pnpm import:listings --remove keserwan-2026-08
 *   pnpm import:listings --describe keserwan-2026-08
 *
 * CSV rather than xlsx. Every usable xlsx reader for Node is a large dependency
 * with a history of advisories, and this repository has just spent a day getting
 * its advisory count down; Excel exports CSV in two clicks. See lib/csv-parse
 * for why the parsing is not a `split(',')` - 108 of the 308 Keserwan rows
 * contain a comma inside a quoted field.
 *
 * # Which database this writes to
 *
 * By default, only the one named in SEED_ALLOWED_DB, which is the same guard the
 * seed uses and which fails closed. Production is reachable, because this import
 * is eventually meant to run there, but only by naming the target identity on
 * the command line - a thing nobody types by accident:
 *
 *   pnpm import:listings file.csv --batch x --target postgres.abc@host/postgres
 *
 * The identity is printed by any refusal, so there is no guessing involved, and
 * it has to match the database DATABASE_URL currently points at.
 */

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

const { default: config } = await import('../payload.config')

interface Args {
  /** Wipe every content collection, keeping the home code and the staff logins. */
  reset: boolean
  /** Empty the database of listings. 'all', 'published' or 'draft'. */
  clear: string | null
  file: string | null
  batch: string | null
  remove: string | null
  describe: string | null
  target: string | null
  dryRun: boolean
  limit: number | null
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    reset: false,
    clear: null,
    file: null,
    batch: null,
    remove: null,
    describe: null,
    target: null,
    dryRun: false,
    limit: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    const next = () => argv[index + 1] ?? null

    switch (arg) {
      case '--batch':
        args.batch = next()
        index += 1
        break
      case '--remove':
        args.remove = next()
        index += 1
        break
      case '--describe':
        args.describe = next()
        index += 1
        break
      case '--clear':
        args.clear = next() ?? 'all'
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
      case '--reset':
        args.reset = true
        break
      case '--dry-run':
        args.dryRun = true
        break
      default:
        if (!arg.startsWith('--') && !args.file) args.file = arg
    }
  }

  return args
}

/**
 * Names the database, or refuses.
 *
 * Two routes, and the difference is what they protect against. Without
 * `--target` this is the seed's guard, which permits exactly one database and
 * fails when nothing is configured. With `--target` the caller states which
 * database they believe they are pointed at, and it has to be true - which is
 * what makes a production run deliberate rather than a consequence of an
 * un-reverted DATABASE_URL.
 */
function assertTarget(stated: string | null): string {
  if (!stated) return assertSeedTarget(process.env, 'seed')

  const actual = databaseIdentity(process.env.DATABASE_URL)

  if (!actual) {
    throw new Error('DATABASE_URL is not set or could not be parsed, so the target is unknown.')
  }

  if (stated.trim().toLowerCase() !== actual) {
    throw new Error(
      [
        'Refusing to run.',
        '',
        '--target does not match the database DATABASE_URL points at.',
        `  you said:  ${stated}`,
        `  it is:     ${actual}`,
        '',
        'Check which database you meant before running this again.',
      ].join('\n'),
    )
  }

  return actual
}

function report(lines: string[]) {
  console.log(lines.join('\n'))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const identity = assertTarget(args.target)

  const payload = await getPayload({ config })

  if (args.describe) {
    const summary = await describeImport(payload, args.describe)
    report([
      `Batch ${summary.batch} on ${identity}`,
      `  listings:  ${summary.listings}`,
      `  with code: ${summary.withCode}`,
      `  published: ${summary.published}`,
    ])
    return
  }

  if (args.reset) {
    const result = await resetContent(payload, { dryRun: args.dryRun })
    const rows = Object.entries(result.removed).filter(([, n]) => n > 0)

    report([
      args.dryRun ? `Would reset ${identity}` : `Reset ${identity}`,
      ...(rows.length
        ? rows.map(([name, n]) => `  ${name.padEnd(14)} ${n}`)
        : ['  nothing to remove']),
      '',
      `  kept, belonging to no listing:`,
      ...result.kept.map((k) => `    ${k.code}  (${k.targetType})`),
      '',
      `  left alone, being accounts rather than content:`,
      ...Object.entries(result.untouched).map(([name, n]) => `    ${name.padEnd(14)} ${n}`),
      ...(result.failures.length
        ? [
            '',
            `  ${result.failures.length} refused:`,
            ...result.failures.map((f) => `    ${f.what}: ${f.error}`),
          ]
        : []),
    ])
    return
  }

  if (args.clear) {
    if (!['all', 'published', 'draft'].includes(args.clear)) {
      throw new Error(`--clear takes all, published or draft. Got "${args.clear}".`)
    }

    const status = args.clear === 'all' ? undefined : (args.clear as 'published' | 'draft')
    const result = await clearListings(payload, {
      ...(status ? { status } : {}),
      dryRun: args.dryRun,
    })

    report([
      args.dryRun
        ? `Would clear ${args.clear} listings from ${identity}`
        : `Cleared ${args.clear} listings from ${identity}`,
      `  listings:    ${result.listings}`,
      `  qr codes:    ${result.codes}`,
      `  scan events: ${result.scanEvents}`,
      `  bookings:    ${result.bookings}`,
      '',
      `  ${result.kept.length} code(s) kept, belonging to no listing:`,
      ...result.kept.map((k) => `    ${k.code}  (${k.targetType})`),
      ...(result.failures.length
        ? [
            '',
            `  ${result.failures.length} refused:`,
            ...result.failures.map((f) => `    ${f.what}: ${f.error}`),
          ]
        : []),
    ])
    return
  }

  if (args.remove) {
    const result = await removeImport(payload, args.remove, { dryRun: args.dryRun })
    report([
      args.dryRun
        ? `Would remove batch ${result.batch} from ${identity}`
        : `Removed batch ${result.batch} from ${identity}`,
      `  listings: ${result.listings}`,
      `  codes:    ${result.codes}`,
      ...(result.failures.length
        ? [
            '',
            `  ${result.failures.length} refused:`,
            ...result.failures.map((f) => `    ${f.what}: ${f.error}`),
          ]
        : []),
    ])
    return
  }

  if (!args.file || !args.batch) {
    throw new Error(
      'Usage: pnpm import:listings <file.csv> --batch <name> [--dry-run] [--limit n]\n' +
        '       pnpm import:listings --describe <batch>\n' +
        '       pnpm import:listings --remove <batch> [--dry-run]',
    )
  }

  const csv = readFileSync(path.resolve(args.file), 'utf8')

  const result = await runImport(payload, {
    csv,
    batch: args.batch,
    dryRun: args.dryRun,
    ...(args.limit ? { limit: args.limit } : {}),
  })

  report([
    args.dryRun ? `Dry run against ${identity}. Nothing was written.` : `Imported into ${identity}`,
    `  rows mapped:      ${result.parsed}`,
    `  listings created: ${result.created}`,
    `  already present:  ${result.skippedExisting}`,
    `  unmappable rows:  ${result.unmappable.length}`,
    `  failed to save:   ${result.failures.length}`,
    '',
    `  ${result.warnings.length} listings need a person to look at them:`,
    ...result.warnings
      .slice(0, 40)
      .map((entry) => `    ${entry.name}: ${entry.warnings.join('; ')}`),
    ...(result.warnings.length > 40 ? [`    ... and ${result.warnings.length - 40} more`] : []),
    ...(result.failures.length
      ? ['', '  failures:', ...result.failures.map((f) => `    ${f.name}: ${f.error}`)]
      : []),
    '',
    args.dryRun
      ? `  Run again without --dry-run to write these.`
      : `  Codes are on /qr/sheet. Remove the batch with: pnpm import:listings --remove ${args.batch}`,
  ])
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
