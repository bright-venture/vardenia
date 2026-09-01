import type { Payload } from 'payload'
import { DEFAULT_PLACEMENT } from '@vardenia/core'
import { placeholderImage } from '../seed/images'
import { richText } from '../seed/rich-text'
import { parseCsvTable } from '../lib/csv-parse'
import { PLACEHOLDER_STEM } from '../lib/media'
import { allocateCode } from '../lib/allocate-code'
import { toListings, type ImportedListing } from './listing-row'

/**
 * Writes mapped spreadsheet rows into the Businesses collection.
 *
 * # What this is for
 *
 * A directory arrives as a spreadsheet, and every listing in it needs a QR code
 * before the designer can lay out a page. Creating 308 listings by hand is not a
 * plan, and the codes are the actual deliverable: `ensureQrCode` mints one on
 * every save, so importing a listing produces a code as a side effect and
 * /qr/sheet then prints the lot.
 *
 * # Everything arrives as a draft
 *
 * Nothing here is a customer. These are businesses whose public details were
 * collected into a spreadsheet, most of them with nothing but a name, a town and
 * a phone number. Published, they would be thin entries under a brand that sells
 * itself on being curated - so they are drafts, invisible to readers, and a
 * person publishes each one as it is verified or sold.
 *
 * Draft still mints a code, which is what makes the demo possible without
 * putting anything live.
 *
 * # Every row carries its batch
 *
 * `importBatch` is what makes the whole thing reversible. See
 * hooks/protectPrintedCodes for why removal needs it, and remove.ts for the
 * other half.
 */

/**
 * The name the placeholder is uploaded under.
 *
 * It is never stored under this name. `unguessableFilename` renames every
 * upload before it is written, keeping the slugified stem and appending 96 bits
 * of randomness, and `formatOptions` then converts the file to WebP. So this
 * arrives as `import-placeholder.jpg` and is stored as
 * `import-placeholder-a3f19c4e2b7d5081cf20b114.webp`.
 *
 * That is why the lookup below matches on the stem rather than on the whole
 * name. Asking for this string exactly is what the first version did, and it
 * could never match anything: every listing found no placeholder and uploaded
 * its own. Production ended up with 308 near-identical gradients and dev with
 * the same, each one re-encoded to WebP and given five derived sizes - exactly
 * the cost the comment on `placeholderId` says this avoids.
 *
 * unguessableFilename.test.ts pins the property this depends on: that the stem
 * survives the rename.
 *
 * The stem itself comes from lib/media rather than being declared here. It was
 * declared in both for one commit, which is the drift the comment beside it
 * warns about: rendering needs the same answer, and a listing page that no
 * longer recognises the stand-in would open on it at full bleed.
 */
const PLACEHOLDER_UPLOAD_NAME = `${PLACEHOLDER_STEM}.jpg`

export interface ImportOptions {
  csv: string
  batch: string
  /** Work out everything and write nothing. */
  dryRun?: boolean
  /** Skip this many mapped listings before starting. See `nextOffset`. */
  offset?: number
  /** Stop after this many listings. For a quick look, or for one window. */
  limit?: number
}

export interface ImportResult {
  /** Listings the file maps to in total, whatever this run wrote. */
  parsed: number
  created: number
  skippedExisting: number
  unmappable: { sourceId: string; name: string; reason: string }[]
  warnings: { name: string; warnings: string[] }[]
  failures: { name: string; error: string }[]
  /**
   * Where a caller should resume, or null when the file is finished.
   *
   * # Why an import is windowed at all
   *
   * A listing takes a couple of seconds to write: a lookup, a create, a QR code
   * minted by a hook that does several queries of its own, and a link back. On
   * this deployment that is a round trip to Frankfurt each time, and the
   * functions run in us-east-1. Three hundred listings is twelve minutes.
   *
   * A Netlify function is killed at ten seconds. So an import that runs inside
   * one request cannot exist here, and pretending otherwise would produce a
   * feature that works on a laptop and times out in production having written
   * an unknown number of rows.
   *
   * Windowing moves the loop to the browser, which has no such limit. Each
   * window is a whole request that either finishes or does not, and because
   * every write is skipped when the slug already exists, a retried window
   * cannot duplicate anything.
   */
  nextOffset: number | null
}

/**
 * The placeholder photograph every imported listing points at.
 *
 * `heroImage` is required, and these listings have no photography. One shared
 * image rather than one per listing: 308 uploads would each be re-encoded to
 * WebP and given five derived sizes, which is slow and fills the bucket with
 * near-identical gradients.
 *
 * Deliberately ugly and labelled, for the same reason the seed's are. Nobody
 * should look at a listing and be unsure whether the photograph is real.
 */
export async function placeholderId(payload: Payload): Promise<number | string> {
  const existing = await payload.find({
    collection: 'media',
    // Contains, not equals. See PLACEHOLDER_STEM for why the stored name is
    // never the name it was uploaded under.
    where: { filename: { like: PLACEHOLDER_STEM } },
    limit: 1,
    // Oldest first, so every window of every import converges on the same
    // image instead of whichever one a page of results happened to return.
    sort: 'createdAt',
    depth: 0,
    overrideAccess: true,
  })

  const found = existing.docs[0]
  if (found) return found.id

  const data = await placeholderImage({ label: 'PHOTO NEEDED', seed: 3 })

  const created = await payload.create({
    collection: 'media',
    data: {
      alt: 'Placeholder image. This listing has no photography yet.',
      credit: 'Vardenia placeholder',
      usageRights: 'owned',
    },
    file: { data, mimetype: 'image/jpeg', name: PLACEHOLDER_UPLOAD_NAME, size: data.length },
    depth: 0,
    overrideAccess: true,
  })

  return created.id
}

/**
 * The Payload document for one mapped row.
 *
 * Cast for the same reason the seed casts: `category`, `governorate` and the
 * rest are narrowed by Payload's generated types to literal unions, and
 * listing-row holds plain strings so that it does not depend on a generated
 * file. listing-row.test.ts checks every one of those strings against the real
 * taxonomy, which catches more than the compiler would - including a
 * subcategory filed under the wrong parent.
 */
function documentFor(listing: ImportedListing, heroImage: number | string, batch: string) {
  return {
    name: listing.name,
    slug: listing.slug,
    ...(listing.tagline ? { tagline: listing.tagline } : {}),
    heroImage,
    category: listing.category,
    subcategories: listing.subcategories,
    governorate: listing.governorate,
    ...(listing.district ? { district: listing.district } : {}),
    ...(listing.address ? { address: listing.address } : {}),
    ...(listing.priceRange ? { priceRange: listing.priceRange } : {}),
    ...(listing.googleRating !== null
      ? { googleRating: listing.googleRating, ratingCheckedAt: new Date().toISOString() }
      : {}),
    ...(listing.description ? { description: richText([listing.description]) } : {}),
    ...(listing.tags.length ? { tags: listing.tags } : {}),
    ...(listing.seasonality.length ? { seasonality: listing.seasonality } : {}),
    tier: 'free',
    importBatch: batch,
    // Explicit rather than relying on the collection's default, because this is
    // the single most consequential field in the whole import.
    _status: 'draft' as const,
  }
}

/**
 * Mint the code before the listing, so the listing is only ever written once.
 *
 * # Why the order is backwards
 *
 * `ensureQrCode` mints a code in an afterChange hook and then updates the
 * listing to point at it. That second update is a whole extra save of a
 * versioned document with three array fields: measured, it rewrote the row, a
 * new draft version, the locales row and every subcategory row, and accounted
 * for roughly twenty of the fifty-seven round trips a listing cost.
 *
 * A listing created with `qrCode` already set never enters that hook at all -
 * it returns early on `doc.qrCode` - so the expensive save happens once. The
 * link back to the listing then goes on the code instead, which has no versions
 * and no arrays and costs a few statements.
 *
 * # What a half-finished mint leaves behind
 *
 * Between this and the listing there is a code whose targetType is `business`
 * and whose business is empty. `business` is not a required field, so nothing
 * refuses it; `/g/<code>` would fail to resolve for as long as it lasts.
 *
 * The caller deletes it when the listing fails, so the only way one survives is
 * the process being killed mid-listing. Such a code has never been printed and
 * has no scans, so `protectPrintedCodes` allows it to be deleted by hand in the
 * admin panel. `removeImport` will not find it, because it finds codes through
 * their listing - which is the same reason it cannot be left to chance.
 */
async function mintCode(payload: Payload): Promise<number | string | null> {
  const code = await allocateCode(payload)
  if (!code) return null

  const created = await payload.create({
    collection: 'qr-codes',
    data: { code, targetType: 'business', placement: DEFAULT_PLACEMENT, active: true },
    depth: 0,
    overrideAccess: true,
  })

  return created.id
}

export async function runImport(payload: Payload, options: ImportOptions): Promise<ImportResult> {
  const table = parseCsvTable(options.csv)
  const { listings, skipped } = toListings(table.rows)

  /**
   * The slice this run is responsible for.
   *
   * Mapping happens over the whole file every time, deliberately. Slugs are
   * deduplicated across the file, so mapping only a window would give the
   * second "Blue Table" the slug `blue-table` rather than `blue-table-2` and
   * the write would fail on the unique column. Mapping is milliseconds; the
   * writes are what cost.
   */
  const offset = Math.max(0, options.offset ?? 0)
  const end = options.limit ? offset + options.limit : listings.length
  const wanted = listings.slice(offset, end)

  const result: ImportResult = {
    parsed: listings.length,
    created: 0,
    skippedExisting: 0,
    unmappable: skipped,
    warnings: wanted
      .filter((listing) => listing.warnings.length > 0)
      .map((listing) => ({ name: listing.name, warnings: listing.warnings })),
    failures: [],
    nextOffset: end < listings.length ? end : null,
  }

  if (options.dryRun) return result

  /**
   * An offset past the end of the file asks for nothing, and asking the
   * database for nothing is not harmless here: `slug: { in: [] }` is either a
   * syntax error or, worse, a condition that matches everything - which would
   * mark every listing as already present and skip the window in silence.
   */
  if (wanted.length === 0) return result

  const heroImage = await placeholderId(payload)

  /**
   * Which of this window's slugs are already taken, in one question.
   *
   * Re-runnable. A run that dies halfway through - a dropped connection is
   * enough - has to be restartable without creating a second copy of everything
   * it managed the first time.
   *
   * Asked once per window rather than once per listing. It used to be a `find`
   * inside the loop, which on a versioned collection is a count and a select,
   * so two round trips per listing to answer a question one round trip answers
   * for the whole window. `pagination: false` is what drops the count.
   */
  const taken = await payload.find({
    collection: 'businesses',
    where: { slug: { in: wanted.map((listing) => listing.slug) } },
    pagination: false,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })

  const existingSlugs = new Set(taken.docs.map((doc) => (doc as { slug?: string }).slug))

  for (const listing of wanted) {
    if (existingSlugs.has(listing.slug)) {
      result.skippedExisting += 1
      continue
    }

    // Null when the code space refused to yield a free code, which
    // `allocateCode` treats as recoverable. The listing is still worth writing;
    // ensureQrCode will try again on the next save.
    const qrCode = await mintCode(payload)

    try {
      const created = await payload.create({
        collection: 'businesses',
        data: {
          ...documentFor(listing, heroImage, options.batch),
          ...(qrCode !== null ? { qrCode } : {}),
        } as never,
        draft: true,
        // The returned document is counted and thrown away, so populating its
        // relationships is three round trips spent on nothing.
        depth: 0,
        overrideAccess: true,
      })

      if (qrCode !== null) {
        await payload.update({
          collection: 'qr-codes',
          id: qrCode,
          data: { business: created.id },
          depth: 0,
          overrideAccess: true,
        })
      }

      result.created += 1
    } catch (error) {
      /**
       * One bad row must not end the run. 308 listings is a long enough job
       * that failing on the last one and rolling nothing back would waste the
       * whole thing, and every failure is named at the end.
       *
       * The code minted for it goes too. It points at no listing, so nothing
       * would ever find it again: `removeImport` reaches codes through the
       * listing that owns them.
       */
      if (qrCode !== null) {
        /**
         * try/catch rather than `.catch()`. A `payload.delete` that throws
         * before returning a promise - which is what a missing method does -
         * escapes the handler entirely and takes down the whole window,
         * replacing the row's real error with a confusing one. Found by a test
         * whose fake had no delete, which is the shape of the real bug.
         */
        try {
          await payload.delete({ collection: 'qr-codes', id: qrCode, overrideAccess: true })
        } catch {
          // The listing failed; a stray code is the smaller problem and saying
          // so twice would bury the error that matters.
        }
      }

      result.failures.push({
        name: listing.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}
