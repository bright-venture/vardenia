import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'
import { checkSeedTarget, databaseIdentity } from '../seed/guard'
import { LOCALES, DEFAULT_LOCALE, dirFor, type Locale } from '@vardenia/i18n'

/**
 * Populate the machine-translated listing descriptions for the eight locales
 * beyond English and Arabic.
 *
 *   pnpm --filter @vardenia/web translate:descriptions --dry-run
 *   pnpm --filter @vardenia/web translate:descriptions --target <user>@<host>/<db>
 *
 * The source descriptions are single-paragraph rich text, so each translation is
 * wrapped back into the same Lexical shape, with the paragraph direction set
 * from the locale (Urdu is RTL). It updates whatever state the listing is in, so
 * published and draft listings are both covered. English and Arabic are the
 * source pair and are never touched; names and addresses are left to fall back
 * to English.
 *
 * Runs after the locale-expansion migration (20260911_090000). Through Payload,
 * not SQL, for the version and revalidation reasons unpublish.ts explains. The
 * text is machine output and wants a native review before launch.
 */

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })
;(process.env as Record<string, string>).NODE_ENV = 'production'

const { default: config } = await import('../payload.config')

const TARGET_LOCALES = LOCALES.filter((l) => l !== 'en' && l !== 'ar')

type Row = { id: number; slug: string; en: string } & Partial<Record<Locale, string>>

/** The single-paragraph Lexical value the source descriptions use. */
function richText(text: string, locale: Locale): unknown {
  const direction = dirFor(locale)
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction,
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction,
          textFormat: 0,
          children: [
            { mode: 'normal', text, type: 'text', style: '', detail: 0, format: 0, version: 1 },
          ],
        },
      ],
    },
  }
}

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
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'description-translations.json'),
      'utf8',
    ),
  )

  console.log(
    `${args.dryRun ? '[dry run] ' : ''}Writing descriptions for ${TARGET_LOCALES.length} locales across ${rows.length} listings on ${identity}.`,
  )

  if (args.dryRun) {
    const sample = rows[0]
    if (sample) console.log('First listing:', sample.slug, '\n  fr:', sample.fr ?? '(missing)')
    return
  }

  const payload = await getPayload({ config })
  let written = 0
  let skipped = 0

  for (const row of rows) {
    for (const locale of TARGET_LOCALES) {
      const text = row[locale]
      if (!text) {
        skipped += 1
        continue
      }
      try {
        await payload.update({
          collection: 'businesses',
          id: row.id,
          locale,
          data: { description: richText(text, locale) as never },
          depth: 0,
          overrideAccess: true,
          // The auto-translate hook must not fire off this backfill write.
          context: { skipAutoTranslate: true },
        })
        written += 1
      } catch (error) {
        console.error(`  failed ${row.slug} [${locale}]:`, (error as Error).message)
      }
    }
    process.stdout.write('.')
  }

  console.log(
    `\nDone. ${written} descriptions written, ${skipped} skipped. Default locale stays ${DEFAULT_LOCALE}.`,
  )
}

await main()
process.exit(0)
