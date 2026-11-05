/** Only the configured public media bucket may supply reader PDFs. Never use
 * a visitor-supplied URL, follow redirects, or attach storage credentials. */
export function publicPdfUrl(value: string, env: Record<string, string | undefined>): URL | null {
  const endpoint = (env.S3_ENDPOINT ?? '').replace(/\/$/, '')
  const base =
    (env.S3_PUBLIC_BASE_URL ?? '').replace(/\/$/, '') ||
    (endpoint && env.S3_BUCKET
      ? `${endpoint.replace(/\/storage\/v1\/s3$/, '/storage/v1/object/public')}/${env.S3_BUCKET}`
      : '')
  if (!base) return null
  try {
    const allowed = new URL(`${base}/`)
    const url = new URL(value)
    if (/%(?:2e|2f|5c|25)/i.test(url.pathname) || url.pathname.includes('\\')) return null
    if (allowed.protocol !== 'https:' || url.protocol !== 'https:' || url.username || url.password)
      return null
    // Compare origin AND bucket boundary: a different bucket is not public media.
    if (url.origin !== allowed.origin || !url.pathname.startsWith(allowed.pathname)) return null
    if (/^(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|\[)/i.test(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

// Read-only delivery limit. This does not change the CMS upload policy.
export const MAX_ISSUE_PDF_BYTES = 256 * 1024 * 1024
export function safePdfFilename(value: unknown): value is string {
  return typeof value === 'string' && /^[\w.-]+\.pdf$/i.test(value) && !value.includes('..')
}

export interface PdfRange {
  start: number
  end: number
}
export function validRangeHeader(value: string): boolean {
  const match = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(value)
  if (!match || (!match[1] && !match[2])) return false
  if (!match[1]) return Number(match[2]) > 0
  return !match[2] || Number(match[2]) >= Number(match[1])
}
export function resolvePdfRange(value: string, total: number): PdfRange | null {
  if (!validRangeHeader(value) || !Number.isSafeInteger(total) || total <= 0) return null
  const [startValue, endValue] = value.slice(6).split('-')
  const start = startValue ? Number(startValue) : Math.max(0, total - Number(endValue))
  const end = startValue
    ? endValue
      ? Math.min(Number(endValue), total - 1)
      : total - 1
    : total - 1
  return start < total ? { start, end } : null
}
export function contentRange(value: string | null): (PdfRange & { total: number }) | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '')
  if (!match) return null
  const [start, end, total] = match.slice(1).map(Number)
  return Number.isSafeInteger(total) &&
    total! > 0 &&
    total! <= MAX_ISSUE_PDF_BYTES &&
    start! >= 0 &&
    start! <= end! &&
    end! < total!
    ? { start: start!, end: end!, total: total! }
    : null
}

/** Validate a small prefix, then forward with backpressure. No full-file buffer.
 * Cancellation/error/EOF releases upstream resources and the route's slot. */
export async function streamPdf(
  body: ReadableStream<Uint8Array>,
  {
    expectedLength,
    checkSignature,
    signal,
    onComplete,
  }: {
    expectedLength?: number
    checkSignature: boolean
    signal: AbortSignal
    onComplete: () => void
  },
): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader()
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let finished = false
  let count = 0
  const pending: Uint8Array[] = []
  const finish = () => {
    if (!finished) {
      finished = true
      signal.removeEventListener('abort', abort)
      onComplete()
    }
  }
  const abort = () => {
    if (finished) return
    void reader.cancel(signal.reason).catch(() => {})
    controller?.error(signal.reason)
    finish()
  }
  signal.addEventListener('abort', abort, { once: true })
  const countedRead = async () => {
    const result = await reader.read()
    signal.throwIfAborted()
    if (result.done) {
      if (expectedLength !== undefined && count !== expectedLength) throw new Error('Truncated PDF')
    } else {
      count += result.value.byteLength
      if (count > MAX_ISSUE_PDF_BYTES || (expectedLength !== undefined && count > expectedLength))
        throw new Error('PDF exceeds declared size')
    }
    return result
  }
  try {
    signal.throwIfAborted()
    if (checkSignature) {
      while (count < 5) {
        const result = await countedRead()
        if (result.done) throw new Error('Not a PDF')
        pending.push(result.value)
      }
      const signature = new Uint8Array(5)
      let offset = 0
      for (const part of pending) {
        const length = Math.min(5 - offset, part.length)
        signature.set(part.subarray(0, length), offset)
        offset += length
        if (offset === 5) break
      }
      if (new TextDecoder().decode(signature) !== '%PDF-') throw new Error('Not a PDF')
    }
    return new ReadableStream<Uint8Array>(
      {
        start(value) {
          controller = value
          if (signal.aborted) abort()
        },
        async pull(value) {
          try {
            if (finished) return
            if (pending.length) {
              value.enqueue(pending.shift()!)
              return
            }
            const next = await countedRead()
            if (next.done) {
              value.close()
              finish()
              await reader.cancel()
            } else value.enqueue(next.value)
          } catch (error) {
            value.error(error)
            finish()
            await reader.cancel(error).catch(() => {})
          }
        },
        async cancel(reason) {
          finish()
          await reader.cancel(reason).catch(() => {})
        },
      },
      { highWaterMark: 0 },
    )
  } catch (error) {
    finish()
    await reader.cancel(error).catch(() => {})
    throw error
  }
}

/** Payload's read API does not accept AbortSignal. Bound the caller's wait and
 * stop a late metadata result from starting storage; this does not cancel an
 * already-running DB query. Backend statement timeouts are a separate concern. */
export function withPdfAbort<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason ?? new Error('PDF request aborted'))
    }
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    void Promise.resolve()
      .then(() => {
        signal.throwIfAborted()
        return operation()
      })
      .then(
        (value) => {
          signal.removeEventListener('abort', abort)
          if (signal.aborted) abort()
          else resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', abort)
          reject(error)
        },
      )
  })
}
