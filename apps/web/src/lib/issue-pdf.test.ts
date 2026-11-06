import { describe, it, expect, vi } from 'vitest'
import {
  contentRange,
  MAX_ISSUE_PDF_BYTES,
  publicPdfUrl,
  resolvePdfRange,
  safePdfFilename,
  streamPdf,
  validRangeHeader,
} from './issue-pdf'
const env = { S3_PUBLIC_BASE_URL: 'https://files.example.com/public/media' }
const bytes = (value: string) => new TextEncoder().encode(value)
describe('magazine PDF storage boundary', () => {
  it('accepts only the configured public bucket', () => {
    expect(publicPdfUrl('https://files.example.com/public/media/issue.pdf', env)?.pathname).toBe(
      '/public/media/issue.pdf',
    )
    for (const url of [
      'https://files.example.com/public/receipts/issue.pdf',
      'https://files.example.com/public/media-other/issue.pdf',
      'https://evil.example.com/public/media/a.pdf',
      'https://files.example.com/public/media/../receipts/a.pdf',
      'http://files.example.com/public/media/a.pdf',
      'https://files.example.com/public/media/%2e%2e%2fprivate/a.pdf',
      'https://files.example.com/public/media/%252e%252e%252fprivate/a.pdf',
      'https://user:pass@files.example.com/public/media/a.pdf',
    ])
      expect(publicPdfUrl(url, env)).toBeNull()
  })
  it('serves magazine PDFs from their own bucket, and no other bucket', () => {
    const env = { S3_ENDPOINT: 'https://a.supabase.co/storage/v1/s3', S3_BUCKET: 'media' }
    const base = 'https://a.supabase.co/storage/v1/object/public'
    expect(publicPdfUrl(`${base}/editions/keserwan.pdf`, env)?.pathname).toBe(
      '/storage/v1/object/public/editions/keserwan.pdf',
    )
    expect(publicPdfUrl(`${base}/media/old.pdf`, env)).not.toBeNull()
    expect(publicPdfUrl(`${base}/receipts/a.pdf`, env)).toBeNull()
    expect(publicPdfUrl(`${base}/editions-evil/a.pdf`, env)).toBeNull()
  })
  it('derives the public bucket address and fails closed without config', () => {
    expect(
      publicPdfUrl('https://a.supabase.co/storage/v1/object/public/media/a.pdf', {
        S3_ENDPOINT: 'https://a.supabase.co/storage/v1/s3',
        S3_BUCKET: 'media',
      }),
    ).not.toBeNull()
    expect(publicPdfUrl('https://anywhere/a.pdf', {})).toBeNull()
    expect(
      publicPdfUrl('https://127.0.0.1/media/a.pdf', {
        S3_PUBLIC_BASE_URL: 'https://127.0.0.1/media',
      }),
    ).toBeNull()
  })
  it('restricts local filenames', () => {
    expect(safePdfFilename('edition-123.pdf')).toBe(true)
    for (const name of ['../a.pdf', 'a/issue.pdf', '..pdf', 'a\\issue.pdf', 'a.png', undefined])
      expect(safePdfFilename(name)).toBe(false)
  })
})
describe('single byte ranges', () => {
  it.each([
    ['bytes=0-0', { start: 0, end: 0 }],
    ['bytes=5-', { start: 5, end: 9 }],
    ['bytes=-3', { start: 7, end: 9 }],
    ['bytes=-99', { start: 0, end: 9 }],
    ['bytes=2-99', { start: 2, end: 9 }],
  ])('resolves %s', (header, range) => {
    expect(resolvePdfRange(header, 10)).toEqual(range)
  })
  it.each([
    'bytes=9-2',
    'bytes=-0',
    'bytes=-',
    'bytes=1-2,3-4',
    'bytes=1.1-2',
    'items=0-1',
    'bytes=99999999999999999-',
  ])('rejects malformed or multipart ranges %s', (header) =>
    expect(validRangeHeader(header)).toBe(false),
  )
  it('rejects unsatisfiable ranges and invalid upstream intervals', () => {
    expect(resolvePdfRange('bytes=10-', 10)).toBeNull()
    expect(contentRange('bytes 2-4/10')).toEqual({ start: 2, end: 4, total: 10 })
    for (const value of [
      'bytes 4-2/10',
      'bytes 0-10/10',
      'bytes 0-2/*',
      `bytes 0-1/${MAX_ISSUE_PDF_BYTES + 1}`,
      'garbage',
    ])
      expect(contentRange(value)).toBeNull()
  })
})
describe('backpressured PDF streams', () => {
  const options = (overrides = {}) => ({
    checkSignature: true,
    signal: new AbortController().signal,
    onComplete: vi.fn(),
    ...overrides,
  })
  it('validates only the prefix before responding and streams remaining bytes on demand', async () => {
    let reads = 0
    const chunks = [bytes('%P'), bytes('DF-1.7'), bytes('later content')]
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++
          const value = chunks.shift()
          if (value) controller.enqueue(value)
          else controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const opts = options()
    const body = await streamPdf(source, opts)
    expect(reads).toBe(2)
    expect(opts.onComplete).not.toHaveBeenCalled()
    expect(await new Response(body).text()).toBe('%PDF-1.7later content')
    expect(opts.onComplete).toHaveBeenCalledOnce()
  })
  it('rejects non-PDF prefixes and cancels the source', async () => {
    const cancel = vi.fn()
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes('<html>'))
      },
      cancel,
    })
    const opts = options()
    await expect(streamPdf(source, opts)).rejects.toThrow('Not a PDF')
    expect(cancel).toHaveBeenCalledOnce()
    expect(opts.onComplete).toHaveBeenCalledOnce()
  })
  it('cancels upstream and releases exactly once when the client cancels', async () => {
    const cancel = vi.fn()
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes('%PDF-'))
      },
      cancel,
    })
    const opts = options()
    const body = await streamPdf(source, opts)
    await body.cancel()
    expect(cancel).toHaveBeenCalledOnce()
    expect(opts.onComplete).toHaveBeenCalledOnce()
  })
  it('aborts even when downstream stops reading', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const opts = options({ signal: controller.signal })
    const body = await streamPdf(
      new ReadableStream({
        start(stream) {
          stream.enqueue(bytes('%PDF-'))
        },
        cancel,
      }),
      opts,
    )
    controller.abort()
    await expect(new Response(body).text()).rejects.toBeDefined()
    expect(cancel).toHaveBeenCalledOnce()
    expect(opts.onComplete).toHaveBeenCalledOnce()
  })
  it.each([3, 50])('rejects declared-length mismatch (%s)', async (expectedLength) => {
    const opts = options({ checkSignature: false, expectedLength })
    const body = await streamPdf(new Response('12345').body!, opts)
    await expect(new Response(body).text()).rejects.toThrow()
    expect(opts.onComplete).toHaveBeenCalledOnce()
  })
})
