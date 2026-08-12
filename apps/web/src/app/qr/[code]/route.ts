import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '../../../payload.config'
import { DEFAULT_PRINT_MM, parseCodeParam, qrPng, qrSvg } from '../../../lib/qr-image'

/**
 * The printable image for a code. `/qr/K3M9QP2` gives an SVG ready for layout.
 *
 * Query parameters:
 *   format=svg|png   svg by default; png only for slides and email
 *   size=25          printed size in millimetres (svg), pixels (png)
 *   download=1       forces a save dialog instead of rendering in the tab
 *
 * The code must already exist. Generating an image for any arbitrary string
 * would be one line shorter and would let somebody paste a typo into the layout
 * and print 20,000 copies of a code that resolves to nothing. There is no
 * recovering from that, so the lookup is worth the round trip.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = parseCodeParam(rawCode)
  if (!code) {
    return new Response('Not a valid code', { status: 400 })
  }

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'qr-codes',
    where: { code: { equals: code } },
    limit: 1,
    depth: 0,
    // Reads existence only. Nothing from the document reaches the response, and
    // the image encodes a URL that is printed in a magazine, so there is nothing
    // here to protect - but the staff-only read rule would block it otherwise.
    overrideAccess: true,
  })

  if (result.docs.length === 0) {
    return new Response('No such code', { status: 404 })
  }

  const url = new URL(request.url)
  const download = url.searchParams.get('download') === '1'

  if (url.searchParams.get('format') === 'png') {
    const pixels = Number(url.searchParams.get('size')) || 1024
    const png = await qrPng(code, { pixels })
    return new Response(new Uint8Array(png), {
      headers: {
        'content-type': 'image/png',
        ...disposition(download, `${code}.png`),
        // A code is immutable, so its image never changes. Private, because the
        // sheet route behind it is staff-only and a shared CDN cache is a
        // needless place to leave anything.
        'cache-control': 'private, max-age=31536000, immutable',
      },
    })
  }

  const sizeMm = Number(url.searchParams.get('size')) || DEFAULT_PRINT_MM
  const svg = await qrSvg(code, { sizeMm })
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      ...disposition(download, `${code}.svg`),
      'cache-control': 'private, max-age=31536000, immutable',
    },
  })
}

function disposition(download: boolean, filename: string): Record<string, string> {
  return download ? { 'content-disposition': `attachment; filename="${filename}"` } : {}
}
