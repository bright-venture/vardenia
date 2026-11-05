import { realpath, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { getPayload } from 'payload'
import { withRateLimit } from '../../../../lib/rate-limit'
import config from '../../../../payload.config'
import {
  contentRange,
  MAX_ISSUE_PDF_BYTES,
  publicPdfUrl,
  resolvePdfRange,
  safePdfFilename,
  streamPdf,
  validRangeHeader,
  withPdfAbort,
} from '../../../../lib/issue-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const unavailable = (status = 502) =>
  new Response('PDF unavailable', { status, headers: { 'Cache-Control': 'no-store' } })
const rangeError = (total?: number) =>
  new Response(null, {
    status: 416,
    headers: {
      'Cache-Control': 'no-store',
      ...(total ? { 'Content-Range': `bytes */${total}` } : {}),
    },
  })
const baseHeaders = () =>
  new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="magazine.pdf"',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })

/** Public issue lookup on every request; never an arbitrary-URL proxy. Only a
 * single byte range is accepted, with exact upstream interval validation. */
async function deliver(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
  release: () => void,
) {
  const requested = request.headers.get('range')
  if (requested && !validRangeHeader(requested)) return rangeError()
  // Range transfers are small. Slow/abandoned full-download fallbacks are bounded.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)])
  try {
    const { slug } = await withPdfAbort(() => params, signal)
    const payload = await withPdfAbort(() => getPayload({ config }), signal)
    const result = await withPdfAbort(
      () =>
        payload.find({
          collection: 'issues',
          where: { slug: { equals: slug } },
          limit: 1,
          depth: 1,
          overrideAccess: false,
        }),
      signal,
    )
    const media = result.docs[0]?.digitalEdition
    if (!media || typeof media !== 'object' || media.mimeType !== 'application/pdf' || !media.url)
      return unavailable(404)
    const headers = baseHeaders()
    let body: ReadableStream<Uint8Array>
    let length: number | undefined
    let start = 0
    let status = 200
    if (process.env.MEDIA_STORAGE_ADAPTER === 's3') {
      const url = publicPdfUrl(media.url, process.env)
      if (!url) return unavailable()
      // Only Range is forwarded. Never forward cookies, auth or arbitrary headers.
      const upstream = await fetch(url, {
        redirect: 'error',
        cache: 'no-store',
        signal,
        headers: { 'Accept-Encoding': 'identity', ...(requested ? { Range: requested } : {}) },
      })
      const reject = async (response: Response) => {
        await upstream.body?.cancel()
        return response
      }
      if (upstream.status === 416) return reject(rangeError())
      if (!upstream.ok || !upstream.body) return reject(unavailable())
      const rawLength = upstream.headers.get('content-length')
      if (rawLength !== null) {
        if (!/^\d+$/.test(rawLength)) return reject(unavailable())
        length = Number(rawLength)
        if (!Number.isSafeInteger(length) || length > MAX_ISSUE_PDF_BYTES)
          return reject(unavailable(413))
      }
      if (requested) {
        // Never hand a full 200 response to a range reader at a nonzero offset.
        const actual = contentRange(upstream.headers.get('content-range'))
        const expected = actual ? resolvePdfRange(requested, actual.total) : null
        if (
          upstream.status !== 206 ||
          !actual ||
          !expected ||
          actual.start !== expected.start ||
          actual.end !== expected.end
        )
          return reject(unavailable())
        const intervalLength = actual.end - actual.start + 1
        if (length !== undefined && length !== intervalLength) return reject(unavailable())
        length = intervalLength
        start = actual.start
        status = 206
        headers.set('Content-Range', `bytes ${actual.start}-${actual.end}/${actual.total}`)
        headers.set('Accept-Ranges', 'bytes')
      } else {
        if (upstream.status !== 200) return reject(unavailable())
        if (
          length !== undefined &&
          upstream.headers.get('accept-ranges')?.toLowerCase() === 'bytes' &&
          (!upstream.headers.get('content-encoding') ||
            upstream.headers.get('content-encoding') === 'identity')
        )
          headers.set('Accept-Ranges', 'bytes')
      }
      // Compressed representations cannot safely preserve PDF byte offsets.
      if (
        upstream.headers.get('content-encoding') &&
        upstream.headers.get('content-encoding') !== 'identity'
      )
        return reject(unavailable())
      body = upstream.body
    } else {
      if (!safePdfFilename(media.filename)) return unavailable(404)
      const root = await withPdfAbort(
        () => realpath(path.resolve(process.cwd(), 'public/media')),
        signal,
      )
      const filename = media.filename
      const file = await withPdfAbort(() => realpath(path.join(root, filename)), signal)
      if (!file.startsWith(`${root}${path.sep}`)) return unavailable(404)
      const total = (await withPdfAbort(() => stat(file), signal)).size
      if (total > MAX_ISSUE_PDF_BYTES) return unavailable(413)
      const interval = requested ? resolvePdfRange(requested, total) : { start: 0, end: total - 1 }
      if (!interval) return rangeError(total)
      start = interval.start
      length = interval.end - interval.start + 1
      status = requested ? 206 : 200
      if (requested)
        headers.set('Content-Range', `bytes ${interval.start}-${interval.end}/${total}`)
      headers.set('Accept-Ranges', 'bytes')
      body = Readable.toWeb(
        createReadStream(file, {
          start: interval.start,
          end: interval.end,
          highWaterMark: 64 * 1024,
          signal,
        }),
        { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } },
      ) as ReadableStream<Uint8Array>
    }
    if (length !== undefined) headers.set('Content-Length', String(length))
    const stream = await streamPdf(body, {
      expectedLength: length,
      checkSignature: start === 0 && (status === 200 || length === undefined || length >= 5),
      signal,
      onComplete: release,
    })
    return new Response(stream, { status, headers })
  } catch {
    return unavailable()
  }
}

// Ranges require several requests per page, not one request per book. The budget
// remains per IP/server instance; stream slots are held until EOF/cancel/timeout.
let activeStreams = 0
const limitedDelivery = withRateLimit(async (request, context) => {
  if (activeStreams >= 8)
    return new Response('Reader busy; please retry', {
      status: 503,
      headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
    })
  activeStreams++
  let released = false
  const release = () => {
    if (!released) {
      released = true
      activeStreams--
    }
  }
  try {
    const response = await deliver(
      request,
      context as { params: Promise<{ slug: string }> },
      release,
    )
    if (response.status !== 200 && response.status !== 206) release()
    return response
  } catch {
    release()
    return unavailable()
  }
}, 240)
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return limitedDelivery(request, context as never)
}

// Next's implicit HEAD handling must not leave an unread stream holding a slot.
// Inspect the same safe representation, then explicitly cancel its body.
export async function HEAD(request: Request, context: { params: Promise<{ slug: string }> }) {
  const headers = new Headers(request.headers)
  headers.delete('range')
  const response = await GET(new Request(request, { method: 'GET', headers }), context)
  await response.body?.cancel()
  return new Response(null, { status: response.status, headers: response.headers })
}
