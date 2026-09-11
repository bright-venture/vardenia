import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'
import { checkSeedTarget, databaseIdentity } from '../seed/guard'
import { LOCALES, DEFAULT_LOCALE, type Locale } from '@vardenia/i18n'

/**
 * Populate the machine-translated taglines produced for the non-English,
 * non-Arabic UI locales.
 *
 *   pnpm --filter @vardenia/web translate:taglines --dry-run
 *   pnpm --filter @vardenia/web translate:taglines --target <user>@<host>/<db>
 *
 * # What this writes, and what it deliberately does not
 *
 * Only the `tagline` field, and only for the eight locales beyond English and
 * Arabic. Names and addresses are proper nouns and are left to fall back to
 * English; the long rich-text `description` is left to editorial. English and
 * Arabic taglines are the source and are never touched.
 *
 * Runs only after the locale-expansion migration (20260911_090000): the
 * `_locales` enum must already carry the eight values, or the writes are
 * rejected by the column type.
 *
 * # Through Payload, not SQL
 *
 * The same reason unpublish.ts gives: an UPDATE would skip the version row that
 * drafts depend on and skip the listing revalidation, so the directory would
 * keep serving the old cache. The point of this is what the public sees.
 *
 * The translations are machine-produced from the English tagline and are worth
 * a native review before launch; this tool only moves them into place.
 */

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

// tsx leaves NODE_ENV unset, and Payload's `push` is on unless it is
// 'production'. Initialising against a live database with push on would try to
// sync the schema. See unpublish.ts.
;(process.env as Record<string, string>).NODE_ENV = 'production'

const { default: config } = await import('../payload.config')

const TARGET_LOCALES = LOCALES.filter((l) => l !== 'en' && l !== 'ar')

type Row = { id: number; slug: string; en: string } & Partial<Record<Locale, string>>

function parseArgs(argv: string[]): { target: string | null; dryRun: boolean } {
  const out = { target: null as string | null, dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') out.dryRun = true
    else if (argv[i] === '--target') {
      out.target = argv[i + 1] ?? ''
      i += 1
    }
  }
  return out
}

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
        '  --target <user>@<host>/<database>',
      ].join('\n'),
    )
  }
  const actual = databaseIdentity(process.env.DATABASE_URL)
  if (!actual) throw new Error('DATABASE_URL is not set or could not be parsed.')
  if (stated.trim().toLowerCase() !== actual) {
    throw new Error(`Refusing to run: --target (${stated}) does not match the DB (${actual}).`)
  }
  return actual
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const identity = assertTarget(args.target)

  const rows: Row[] = JSON.parse(
    readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tagline-translations.json'),
      'utf8',
    ),
  )

  console.log(
    `${args.dryRun ? '[dry run] ' : ''}Writing taglines for ${TARGET_LOCALES.length} locales across ${rows.length} listings on ${identity}.`,
  )

  if (args.dryRun) {
    const sample = rows[0]
    if (sample) {
      console.log('First listing:', sample.slug, `(en: ${sample.en})`)
      for (const l of TARGET_LOCALES) console.log(`  ${l}: ${sample[l] ?? '(missing, will skip)'}`)
    }
    return
  }

  const payload = await getPayload({ config })
  let written = 0
  let skipped = 0

  for (const row of rows) {
    for (const locale of TARGET_LOCALES) {
      const tagline = row[locale]
      if (!tagline) {
        skipped += 1
        continue
      }
      try {
        await payload.update({
          collection: 'businesses',
          id: row.id,
          locale,
          data: { tagline },
          overrideAccess: true,
        })
        written += 1
      } catch (error) {
        console.error(`  failed ${row.slug} [${locale}]:`, (error as Error).message)
      }
    }
    process.stdout.write('.')
  }

  console.log(
    `\nDone. ${written} taglines written, ${skipped} skipped (no translation). Default locale stays ${DEFAULT_LOCALE}.`,
  )
}

await main()
process.exit(0)
