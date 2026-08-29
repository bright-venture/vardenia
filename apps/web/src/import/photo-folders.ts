import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsvTable } from '../lib/csv-parse'
import { slugify } from '../fields/slug'

/**
 * Turn a filled-in listing sheet into the empty folder tree its photos go in.
 *
 *   pnpm --filter @vardenia/web photos:folders <filled-sheet.csv> [output-dir]
 *
 * Export the Listings tab of the template as CSV first. The sheet is .xlsx
 * because that is what the people filling it in use; this reads CSV for the
 * same reason import/index.ts does - every usable xlsx reader for Node is a
 * large dependency with a history of advisories.
 *
 * # Why nobody types a folder name
 *
 * A folder has to be matched back to a listing later, and the only reliable
 * link is one nobody hand-writes. Asking a contributor to invent a folder name
 * and also record it in a column gives two places to disagree; deriving it from
 * the business name gives none.
 *
 * # Why folders rather than named files
 *
 * `chez-sami-2.jpg` cannot be told apart from the cover photo of a business
 * whose slug is `chez-sami-2`, and both exist in the directory today - the
 * importer mints that suffix whenever two businesses share a name. Four such
 * slugs are already live. A folder per business removes the ambiguity
 * completely, and matches how a shoot is organised anyway.
 *
 * # It writes the map as well as the folders
 *
 * `_folders.csv` pairs each folder with the business it belongs to, so a later
 * photo import reads the pairing rather than re-deriving it. A business renamed
 * between the shoot and the upload then keeps its photographs.
 */

export interface FolderPlan {
  folder: string
  name: string
}

/**
 * One folder per row, named exactly as the listing importer will name the slug.
 *
 * # Why this imports slugify rather than doing it here
 *
 * The first version reimplemented the rule, and got it wrong three ways: it
 * truncated at 80 characters, it turned `a.b` into `a-b` where the real rule
 * gives `ab`, and it had no fallback for a name written in Arabic, which
 * slugify transliterates. Every one of those produces a folder whose name is
 * not the slug, which is the single thing this file exists to guarantee.
 *
 * # The numbering is the same algorithm, not a similar one
 *
 * A count per base name looks equivalent and is not. Given "Chez Sami",
 * "Chez Sami 2", "Chez Sami", counting gives the first and third the folders
 * `chez-sami` and `chez-sami-2` - and the second row already took
 * `chez-sami-2`. Two businesses, one folder, silently.
 *
 * Probing upward against the set of names already taken is what the importer
 * does, and it cannot collide.
 */
export function planFolders(rows: Record<string, string>[]): {
  plans: FolderPlan[]
  skipped: number
  repeated: { base: string; count: number }[]
} {
  const taken = new Set<string>()
  const bases = new Map<string, number>()
  const plans: FolderPlan[] = []
  let skipped = 0

  for (const row of rows) {
    const name = (row['Name / Listing'] ?? '').trim()
    const base = name ? slugify(name) : ''

    if (!base) {
      skipped += 1
      continue
    }

    bases.set(base, (bases.get(base) ?? 0) + 1)

    let folder = base
    if (taken.has(folder)) {
      let suffix = 2
      while (taken.has(`${base}-${suffix}`)) suffix += 1
      folder = `${base}-${suffix}`
    }

    taken.add(folder)
    plans.push({ folder, name })
  }

  const repeated = [...bases.entries()]
    .filter(([, count]) => count > 1)
    .map(([base, count]) => ({ base, count }))

  return { plans, skipped, repeated }
}

const NOTE = [
  '  cover.jpg   the main photo, shown at the top of the listing',
  '  01.jpg      gallery photos, in the order you want them shown',
  '  02.jpg',
  '',
  'Send cover plus one gallery photo unless you have been told otherwise.',
  'These listings display one gallery image, so anything beyond that is',
  'stored and never seen by anybody.',
  '',
  'Landscape, as large as you have. Do not crop to a square.',
  '',
  'Only photographs we are allowed to publish. Put the credit and where each',
  'one came from in a file called credit.txt next to them. A photo we cannot',
  'show is worse than no photo.',
].join('\r\n')

const escape = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

export function writeFolders(plans: FolderPlan[], target: string): void {
  mkdirSync(target, { recursive: true })

  for (const plan of plans) {
    const dir = path.join(target, plan.folder)
    mkdirSync(dir, { recursive: true })

    const note = path.join(dir, 'PUT PHOTOS HERE.txt')
    // Never overwritten: a second run over a folder somebody has already filled
    // must not disturb what is in it.
    if (!existsSync(note)) writeFileSync(note, `${plan.name}\r\n\r\n${NOTE}\r\n`, 'utf8')
  }

  writeFileSync(
    path.join(target, '_folders.csv'),
    // BOM, so Excel opens the Arabic and accented names as UTF-8.
    '﻿' +
      ['folder,business', ...plans.map((p) => `${escape(p.folder)},${escape(p.name)}`)].join(
        '\r\n',
      ) +
      '\r\n',
    'utf8',
  )
}

const USAGE = [
  'Usage:',
  '  pnpm --filter @vardenia/web photos:folders <sheet.csv> [output-dir]',
  '  pnpm --filter @vardenia/web photos:folders --existing [output-dir] [--limit N] [--missing]',
  '',
  'The first reads a filled-in listing template - export its Listings tab as CSV.',
  'The second reads the listings already in the database, which is what you want',
  'for a directory that has already been imported.',
  '',
  '  --missing   only listings that still have the placeholder image',
  '  --limit N   only the first N',
].join('\n')

/**
 * Folders for listings that already exist, read from the database.
 *
 * The sheet route only covers businesses nobody has entered yet. A directory
 * that has already been imported - which is the situation the moment the first
 * import runs - needs folders named after the slugs those listings actually
 * have, not slugs derived a second time from their names. Deriving again would
 * usually agree and would silently disagree wherever an editor has corrected a
 * name since.
 *
 * `--missing` is the one worth using in practice: it asks only for the listings
 * that still have nothing but the placeholder, so a second round of photography
 * is not a folder tree of businesses that were already done.
 */
async function fromDatabase(outDir: string, limit: number | null, onlyMissing: boolean) {
  const { config: loadEnv } = await import('dotenv')
  const { getPayload } = await import('payload')

  loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

  // tsx leaves NODE_ENV unset and Payload's push is on unless it is production.
  ;(process.env as Record<string, string>).NODE_ENV = 'production'

  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })

  const found = await payload.find({
    collection: 'businesses',
    limit: limit ?? 1000,
    depth: 1,
    draft: true,
    overrideAccess: true,
    sort: 'slug',
  })

  const plans: FolderPlan[] = []

  for (const doc of found.docs) {
    const hero = (doc as { heroImage?: { filename?: string } }).heroImage
    const hasPhoto = Boolean(hero) && !String(hero?.filename ?? '').includes('import-placeholder')

    if (onlyMissing && hasPhoto) continue

    plans.push({
      folder: String((doc as { slug: string }).slug),
      name: String((doc as { name?: string }).name ?? ''),
    })
  }

  const target = path.resolve(outDir)
  writeFolders(plans, target)

  console.log(`${plans.length} folders under ${target}`)
  console.log(`  read ${found.docs.length} listing(s) from the database`)
  if (onlyMissing) console.log('  only the ones still showing the placeholder')

  process.exit(0)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  if (argv.includes('--existing')) {
    const positional = argv.filter((a) => !a.startsWith('--'))
    const limitAt = argv.indexOf('--limit')
    // `--limit 3` puts the 3 in the positional list too; drop it there.
    const limit = limitAt === -1 ? null : Number(argv[limitAt + 1]) || null
    const outDir = positional.find((a) => String(limit) !== a) ?? 'photos'

    await fromDatabase(outDir, limit, argv.includes('--missing'))
    return
  }

  const [sheetPath, outDir = 'photos'] = argv

  if (!sheetPath) {
    console.error(USAGE)
    process.exit(1)
  }

  const table = parseCsvTable(readFileSync(path.resolve(sheetPath), 'utf8'))
  const { plans, skipped, repeated } = planFolders(table.rows)
  const target = path.resolve(outDir)

  writeFolders(plans, target)

  console.log(`${plans.length} folders under ${target}`)
  if (skipped > 0) console.log(`${skipped} row(s) had no usable business name and were skipped`)

  if (repeated.length > 0) {
    console.log('\nSame name more than once, numbered in sheet order:')
    for (const { base, count } of repeated) console.log(`  ${base} x${count}`)
    console.log('Check these are really different businesses before anybody shoots them.')
  }
}

// Only when run directly, so the functions above stay importable by tests.
if (process.argv[1] && process.argv[1].includes('photo-folders')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
