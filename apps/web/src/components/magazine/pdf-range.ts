/**
 * Loads an issue PDF by byte ranges only (11 November 2026).
 *
 * # Why not let PDF.js decide
 *
 * PDF.js opens a URL with one plain request and switches to range requests
 * only if that response carries both `Content-Length` and `Accept-Ranges:
 * bytes`. The issue route (app/read/issue) streams from storage, and on
 * Netlify a streamed response goes out chunked, without a length. So PDF.js
 * never switched: it downloaded the whole file before showing the cover, which
 * for the 42 MB All Lebanon issue was about 37 seconds on 4G. The route itself
 * answers range requests correctly (206 with `Content-Range`).
 *
 * So the reader asks for the first chunk as a range, reads the total size from
 * `Content-Range`, and gives PDF.js a range transport that fetches every later
 * piece the same way. Only the pages being read are downloaded. If the first
 * range request does not come back as a 206, this returns null and the caller
 * opens the URL the old way.
 */

export const RANGE_CHUNK = 1024 * 1024

/** The total size from a `Content-Range: bytes a-b/total` header. */
export function totalFromContentRange(value: string | null): number | null {
  const match = /^bytes \d+-\d+\/(\d+)$/.exec(value ?? '')
  if (!match) return null
  const total = Number(match[1])
  return Number.isSafeInteger(total) && total > 0 ? total : null
}

type RangeTransportClass = typeof import('pdfjs-dist').PDFDataRangeTransport

async function fetchRange(src: string, begin: number, end: number, signal: AbortSignal) {
  // `end` is exclusive, as PDF.js passes it; the header's is inclusive.
  const response = await fetch(src, {
    headers: { Range: `bytes=${begin}-${end - 1}` },
    signal,
    credentials: 'same-origin',
  })
  if (response.status !== 206) {
    await response.body?.cancel()
    throw new Error(`range request answered ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

export async function openByRanges(
  Transport: RangeTransportClass,
  src: string,
  signal: AbortSignal,
): Promise<InstanceType<RangeTransportClass> | null> {
  const first = await fetch(src, {
    headers: { Range: `bytes=0-${RANGE_CHUNK - 1}` },
    signal,
    credentials: 'same-origin',
  })
  const total =
    first.status === 206 ? totalFromContentRange(first.headers.get('content-range')) : null
  if (total === null) {
    await first.body?.cancel()
    return null
  }
  const initial = new Uint8Array(await first.arrayBuffer())

  class IssueRanges extends Transport {
    override requestDataRange(begin: number, end: number) {
      // Three tries: a dropped piece on a phone connection would otherwise
      // leave a page waiting for good.
      const attempt = (left: number): Promise<void> =>
        fetchRange(src, begin, end, signal).then(
          (chunk) => this.onDataRange(begin, chunk),
          (error) => {
            if (signal.aborted || left <= 1) throw error
            return new Promise((resolve) => setTimeout(resolve, 800)).then(() => attempt(left - 1))
          },
        )
      void attempt(3).catch(() => {})
    }
  }
  return new IssueRanges(total, initial)
}
