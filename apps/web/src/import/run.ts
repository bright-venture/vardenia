import type { Payload } from 'payload'
import { placeholderImage } from '../seed/images'
import { richText } from '../seed/rich-text'
import { parseCsvTable } from '../lib/csv-parse'
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

/** One shared image for the whole batch, rather than one per listing. */
const PLACEHOLDER_FILENAME = 'import-placeholder.jpg'

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
async function placeholderId(payload: Payload): Promise<number | string> {
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: PLACEHOLDER_FILENAME } },
    limit: 1,
    depth: 0,
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
    file: { data, mimetype: 'image/jpeg', name: PLACEHOLDER_FILENAME, size: data.length },
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

  const heroImage = await placeholderId(payload)

  for (const listing of wanted) {
    /**
     * Re-runnable. A run that dies halfway through - a dropped connection is
     * enough - has to be restartable without creating a second copy of
     * everything it managed the first time.
     */
    const existing = await payload.find({
      collection: 'businesses',
      where: { slug: { equals: listing.slug } },
      limit: 1,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      result.skippedExisting += 1
      continue
    }

    try {
      await payload.create({
        collection: 'businesses',
        data: documentFor(listing, heroImage, options.batch) as never,
        draft: true,
        overrideAccess: true,
      })

      result.created += 1
    } catch (error) {
      /**
       * One bad row must not end the run. 308 listings is a long enough job
       * that failing on the last one and rolling nothing back would waste the
       * whole thing, and every failure is named at the end.
       */
      result.failures.push({
        name: listing.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}
