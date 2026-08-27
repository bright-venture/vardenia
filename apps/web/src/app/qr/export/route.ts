import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import {
  DEFAULT_PRINT_MM,
  formatFromWord,
  qrPng,
  qrSvg,
  type QrFormat,
} from '../../../lib/qr-image'
import { populated, type QrDoc } from '../../../lib/qr-doc'
import { createZip, safeFileName, type ZipEntry } from '../../../lib/zip'

/**
 * `/qr/export` - every code as its own file, in a zip.
 *
 * `?format=svg` (default) or `?format=png`, `?issue=1` to narrow to one print
 * issue, `?size=40` for the printed millimetre size.
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
  if (qr.targetType === 'home') return 'Vardenia home page'

  const named = populated(qr.business) ?? populated(qr.article) ?? populated(qr.issue)
  if (typeof named?.title === 'string') return named.title
  if (typeof named?.name === 'string') return named.name
  if (qr.targetType === 'external' && typeof qr.externalUrl === 'string') return qr.externalUrl
  return qr.code
}

/**
 * A positive whole number, or null. Copied from the sheet for the same reason
 * it exists there: `?issue=abc` used to be a 500 on the page somebody opens at
 * deadline to check codes against a layout.
 */
function parseIssueId(raw: string | null): number | null {
  if (raw === null) return null
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
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

  const { user } = await payload.auth({ headers: request.headers })
  const roles = ((user as { roles?: string[] } | null)?.roles ?? []) as string[]
  if (!roles.some((role) => role === 'admin' || role === 'staff')) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const url = new URL(request.url)
  const issueParam = url.searchParams.get('issue')
  const issueId = parseIssueId(issueParam)

  if (issueParam !== null && issueId === null) {
    return new Response(
      `"${issueParam}" is not an issue id. Use the number from the issue's URL in the admin, for example /qr/export?issue=1.`,
      { status: 400 },
    )
  }

  const format: QrFormat = formatFromWord(url.searchParams.get('format')) ?? 'svg'

  /**
   * The sheet's own print size, not the QR library's default.
   *
   * Leaving it to the library gave 1024px regardless of what the code is
   * printed at - an arbitrary number that happened to be four times the size
   * the sheet uses, and took twelve seconds for 318 codes.
   */
  const sizeMm = Number(url.searchParams.get('size')) || DEFAULT_PRINT_MM

  const result = await payload.find({
    collection: 'qr-codes',
    where: {
      active: { equals: true },
      ...(issueId !== null ? { issue: { equals: issueId } } : {}),
    },
    limit: 1000,
    depth: 1,
    sort: 'code',
    overrideAccess: false,
    user,
  })

  if (result.docs.length === 0) {
    return new Response('No active codes match, so there is nothing to export.', { status: 404 })
  }

  const cost = format === 'png' ? result.docs.length * sizeMm * sizeMm : 0

  if (cost > PNG_BUDGET) {
    const affordable = Math.floor(Math.sqrt(PNG_BUDGET / result.docs.length))

    return new Response(
      [
        `${result.docs.length} codes at ${sizeMm}mm is too much PNG to render in one request.`,
        '',
        'Any of these works:',
        `  - use SVG, which has no such limit and is better for print: ?format=svg`,
        `  - ask for ${affordable}mm or smaller: ?format=png&size=${affordable}`,
        '  - narrow to one issue: ?issue=1',
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

  for (const doc of result.docs) {
    const qr = doc as unknown as QrDoc
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
        ? new Uint8Array(await qrPng(qr.code, { pixels: pixelsFor(sizeMm) }))
        : new TextEncoder().encode(await qrSvg(qr.code, { sizeMm }))

    entries.push({ name, data })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const label = issueId === null ? 'all' : `issue-${issueId}`
  const filename = `vardenia-qr-${label}-${format}-${stamp}.zip`

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
