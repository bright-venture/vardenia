import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { staffUser } from '../../../lib/billing-auth'
import {
  DEFAULT_PRINT_MM,
  formatFromWord,
  qrPng,
  qrSvg,
  SHIRT_PRINT_MM,
  type QrFormat,
} from '../../../lib/qr-image'
import { populated, shirtLabel, type QrDoc } from '../../../lib/qr-doc'
import { findEvery } from '../../../lib/find-every'
import { isFiltered, parseSheetFilters, sheetWhere } from '../../../lib/qr-sheet-filters'
import { createZip, safeFileName, type ZipEntry } from '../../../lib/zip'

/**
 * `/qr/export` - every code as its own file, in a zip.
 *
 * `?format=svg` (default) or `?format=png`, `?transparent=1` to drop the white
 * background from every file, `?size=40` for the printed millimetre size. Every
 * filter on /qr/sheet works here too (issue, article, governorate, category,
 * batch, placement and the rest - see lib/qr-sheet-filters), and the sheet's
 * download buttons pass them across.
 *
 * # Why files rather than the sheet
 *
 * /qr/sheet is for checking: one page, every code next to the name it belongs
 * to, so a code against the wrong business is caught before it goes to press.
 * It is not something a designer can place into a layout. This is the other
 * half - a folder of named files to drop into InDesign.
 *
 * # Why the names are what they are
 *
 * `Hotel Albergo - K3M9QP2.svg`. The business name first because that is what
 * the designer is looking for, and the code appended because it is the only
 * unique part: two listings can genuinely share a name - the Keserwan directory
 * has two called Blue Table - and a folder cannot hold two files with the same
 * one. Without the code, one would silently overwrite the other.
 *
 * # SVG is the default on purpose
 *
 * A QR code is line art. SVG places at any size with no loss, which matters
 * because the same code goes on a full page and on a business card. PNG exists
 * because some tools still want it, and is rendered at a print-usable density
 * rather than at screen size.
 *
 * Staff only, like the sheet: the images are public by nature, but the file
 * names pair each one with a business, and the list of who is in the next issue
 * is commercially sensitive before publication.
 */

export const dynamic = 'force-dynamic'

/** Matches the sheet, so the two cannot describe the same code differently. */
function labelFor(qr: QrDoc): string {
  const shirt = shirtLabel(qr)
  if (shirt) return shirt
  if (qr.targetType === 'home') return 'Vardenia home page'

  const named = populated(qr.business) ?? populated(qr.article) ?? populated(qr.issue)
  if (typeof named?.title === 'string') return named.title
  if (typeof named?.name === 'string') return named.name
  if (qr.targetType === 'external' && typeof qr.externalUrl === 'string') return qr.externalUrl
  return qr.code
}

/**
 * A printed size in millimetres as a pixel count.
 *
 * 300dpi because that is what a printer expects; below it a QR code's edges go
 * soft and a phone camera has to work harder in bad light, which is exactly the
 * condition a printed code is scanned in.
 *
 * `?size` means the same thing in both formats because of this. Asking for 40mm
 * and getting a 40-pixel PNG would be a reasonable reading of the parameter and
 * a useless file.
 */
const PRINT_DPI = 300
const pixelsFor = (mm: number) => Math.round((mm / 25.4) * PRINT_DPI)

/**
 * How much PNG rendering fits inside a serverless function.
 *
 * Rasterising is the only expensive thing here and it scales with area, so the
 * work is roughly `codes x mm^2`. Measured against 318 codes on a production
 * build:
 *
 *     svg, any size     0.5 - 0.7s
 *     png at 25mm       1.6s
 *     png at 40mm       3.3s
 *     png at 100mm     15.5s
 *
 * A Netlify function is killed at ten seconds, so the last of those is a
 * download that fails after fifteen seconds of waiting, having produced
 * nothing. The budget below is set at roughly six seconds of that measured
 * cost, leaving room for a slower machine than the one it was measured on.
 *
 * SVG has no budget because it does not need one: it is text, and 318 of them
 * take less than a second.
 *
 * Refused rather than silently downscaled. Somebody asking for 100mm codes
 * wants 100mm codes, and quietly giving them 40mm is how the wrong artwork gets
 * into a layout.
 */
const PNG_BUDGET = 1_000_000

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config: (await import('../../../payload.config')).default })

  const user = await staffUser(payload, request.headers)
  if (!user) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const url = new URL(request.url)

  /**
   * The sheet's filters, read by the sheet's own parser, so a download carries
   * exactly the codes the sheet showed. A value that means nothing is refused
   * here rather than ignored: ignoring it would export more codes than asked
   * for, which is the expensive direction to be wrong in.
   */
  const { filters, problems } = parseSheetFilters(url.searchParams)
  if (problems.length > 0) {
    return new Response(`${problems.join(' ')} Nothing was exported.`, { status: 400 })
  }

  const format: QrFormat = formatFromWord(url.searchParams.get('format')) ?? 'svg'

  // `?transparent=1` drops the white background from every file in the archive,
  // for placing a code onto a coloured layout. Not for print; see lib/qr-image.
  const transparent = url.searchParams.get('transparent') === '1'

  /**
   * The sheet's own print size, not the QR library's default.
   *
   * Leaving it to the library gave 1024px regardless of what the code is
   * printed at - an arbitrary number that happened to be four times the size
   * the sheet uses, and took twelve seconds for 318 codes.
   */
  const sizeMm =
    filters.size ?? (filters.placement === 't-shirt' ? SHIRT_PRINT_MM : DEFAULT_PRINT_MM)

  // "Codes in this article" includes the listings it features, as on the sheet.
  let featuredIds: number[] = []
  if (filters.article !== null) {
    const article = await payload
      .findByID({
        collection: 'articles',
        id: filters.article,
        depth: 0,
        overrideAccess: true,
        select: { featuredBusinesses: true },
      })
      .catch(() => null)
    if (!article) {
      return new Response(`No article with id ${filters.article}. Nothing was exported.`, {
        status: 404,
      })
    }
    featuredIds = ((article.featuredBusinesses ?? []) as (number | { id: number })[]).map((b) =>
      typeof b === 'object' ? b.id : b,
    )
  }

  /**
   * Every matching code, not the first thousand. The sheet now pages, so "all"
   * here means all the pages: with 1625 active codes, a single capped query
   * quietly left 625 of them out of the zip.
   */
  const { docs, complete } = await findEvery<QrDoc>(payload, {
    collection: 'qr-codes',
    where: sheetWhere(filters, featuredIds),
    depth: 1,
    sort: 'code',
    overrideAccess: false,
    user,
  })

  if (!complete) {
    return new Response('Too many codes to export at once. Narrow the filters and try again.', {
      status: 413,
    })
  }

  if (docs.length === 0) {
    return new Response('No codes match these filters, so there is nothing to export.', {
      status: 404,
    })
  }

  const cost = format === 'png' ? docs.length * sizeMm * sizeMm : 0

  if (cost > PNG_BUDGET) {
    const affordable = Math.floor(Math.sqrt(PNG_BUDGET / docs.length))

    return new Response(
      [
        `${docs.length} codes at ${sizeMm}mm is too much PNG to render in one request.`,
        '',
        'Any of these works:',
        `  - use SVG, which has no such limit and is better for print: ?format=svg`,
        `  - ask for ${affordable}mm or smaller: ?format=png&size=${affordable}`,
        '  - narrow the filters on the sheet, for example to one issue',
      ].join('\n'),
      { status: 413, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  /**
   * Built one at a time rather than with Promise.all.
   *
   * Rendering several hundred PNGs at once is a burst of sharp work that has no
   * reason to be concurrent - nothing here is waiting on the network - and on a
   * serverless host the memory ceiling is lower than the parallelism would
   * suggest. Sequential is slower to no visible effect and cannot be the thing
   * that kills the function.
   */
  const entries: ZipEntry[] = []
  const usedNames = new Set<string>()

  for (const doc of docs) {
    const qr = doc
    const label = safeFileName(labelFor(qr), qr.code)

    let name = `${label} - ${qr.code}.${format}`
    // The code already makes this unique; the guard is for a name that
    // sanitised down to the same string as another one.
    let suffix = 2
    while (usedNames.has(name.toLowerCase())) {
      name = `${label} - ${qr.code} (${suffix}).${format}`
      suffix += 1
    }
    usedNames.add(name.toLowerCase())

    const data =
      format === 'png'
        ? new Uint8Array(await qrPng(qr.code, { pixels: pixelsFor(sizeMm), transparent }))
        : new TextEncoder().encode(await qrSvg(qr.code, { sizeMm, transparent }))

    entries.push({ name, data })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const label = filters.batch
    ? `batch-${safeFileName(filters.batch)}`
    : typeof filters.issue === 'number'
      ? `issue-${filters.issue}`
      : filters.placement
        ? filters.placement
        : isFiltered(filters)
          ? 'filtered'
          : 'all'
  const bg = transparent ? '-transparent' : ''
  const filename = `vardenia-qr-${label}-${format}${bg}-${stamp}.zip`

  const zip = createZip(entries)

  return new Response(zip as unknown as BodyInit, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': String(zip.length),
      // Never cached: it names who is in an unpublished issue.
      'cache-control': 'no-store',
    },
  })
}
