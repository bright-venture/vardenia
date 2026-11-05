import path from 'node:path'
import { Readable } from 'node:stream'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const { find, createReadStream, realpath, stat } = vi.hoisted(() => ({
  find: vi.fn(),
  createReadStream: vi.fn(),
  realpath: vi.fn(),
  stat: vi.fn(),
}))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
vi.mock('../../../../payload.config', () => ({ default: {} }))
vi.mock('node:fs/promises', () => ({ realpath, stat }))
vi.mock('node:fs', () => ({ createReadStream }))
import { GET, HEAD } from './route'
import { __resetRateLimit } from '../../../../lib/rate-limit'
import { MAX_ISSUE_PDF_BYTES } from '../../../../lib/issue-pdf'

// Built with the platform's own separator: the route checks the file is inside
// the media folder by `root + path.sep`, so POSIX literals fail on Windows.
const MEDIA_ROOT = path.resolve('/safe/public/media')
const MEDIA_FILE = path.join(MEDIA_ROOT, 'a.pdf')
const OUTSIDE_FILE = path.resolve('/private/a.pdf')
const media = {
  mimeType: 'application/pdf',
  url: 'https://storage.example/public/media/a.pdf',
  filename: 'a.pdf',
}
const context = { params: Promise.resolve({ slug: 'summer' }) }
const responses: Response[] = []
const call = async (range?: string, extra?: RequestInit) => {
  const response = await GET(
    new Request('http://localhost/read/issue/summer', {
      ...extra,
      headers: {
        cookie: 'secret=never-forward',
        ...(range ? { Range: range } : {}),
        ...extra?.headers,
      },
    }),
    context,
  )
  responses.push(response)
  return response
}
beforeEach(() => {
  __resetRateLimit()
  vi.stubEnv('MEDIA_STORAGE_ADAPTER', 's3')
  vi.stubEnv('S3_PUBLIC_BASE_URL', 'https://storage.example/public/media')
  vi.stubEnv('S3_ENDPOINT', '')
  find.mockResolvedValue({ docs: [{ digitalEdition: media }] })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      async () =>
        new Response('%PDF-1.7\n', {
          headers: { 'content-length': '9', 'accept-ranges': 'bytes' },
        }),
    ),
  )
})
afterEach(async () => {
  for (const response of responses.splice(0))
    if (!response.bodyUsed) await response.body?.cancel().catch(() => {})
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
describe('public streaming issue delivery', () => {
  it('retains public CMS access, avoids cookie forwarding, and advertises real range support', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('9')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, collection: 'issues' }),
    )
    const options = vi.mocked(fetch).mock.calls[0]![1]!
    expect(options).toMatchObject({ redirect: 'error', cache: 'no-store' })
    expect(options.headers).toEqual({ 'Accept-Encoding': 'identity' })
    expect(await response.text()).toBe('%PDF-1.7\n')
  })
  it('serves a 76 MiB document progressively without buffering it', async () => {
    let reads = 0
    const cancel = vi.fn()
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream(
          {
            pull(controller) {
              reads++
              controller.enqueue(new TextEncoder().encode('%PDF-1.7\n'))
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
        { headers: { 'content-length': String(76 * 1024 * 1024), 'accept-ranges': 'bytes' } },
      ),
    )
    const response = await call()
    expect(response.status).toBe(200)
    expect(reads).toBe(1)
    expect(response.headers.get('content-length')).toBe(String(76 * 1024 * 1024))
    await response.body!.cancel()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('serves HEAD metadata and explicitly cancels the otherwise unread body', async () => {
    const cancel = vi.fn()
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('%PDF-1.7\n'))
            },
            cancel,
          }),
          { headers: { 'content-length': '9', 'accept-ranges': 'bytes' } },
        ),
    )
    for (let i = 0; i < 10; i++) {
      const response = await HEAD(
        new Request('http://localhost/read/issue/summer', { method: 'HEAD' }),
        context,
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('content-length')).toBe('9')
      expect(response.body).toBeNull()
    }
    expect(cancel).toHaveBeenCalledTimes(10)
  })
  it('forwards one Range and returns exact partial-byte headers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('56789', {
        status: 206,
        headers: { 'content-range': 'bytes 5-9/80000000', 'content-length': '5' },
      }),
    )
    const response = await call('bytes=5-9')
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 5-9/80000000')
    expect(vi.mocked(fetch).mock.calls[0]![1]!.headers).toEqual({
      'Accept-Encoding': 'identity',
      Range: 'bytes=5-9',
    })
    expect(await response.text()).toBe('56789')
  })
  it.each(['', 'x', '%PDF'])(
    'rejects truncated full responses even when length is declared (%s)',
    async (body) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(body, { headers: { 'content-length': String(body.length) } }),
      )
      expect((await call()).status).toBe(502)
    },
  )
  it('supports short zero-offset probes', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('%', {
        status: 206,
        headers: { 'content-range': 'bytes 0-0/100', 'content-length': '1' },
      }),
    )
    const response = await call('bytes=0-0')
    expect(response.status).toBe(206)
    expect(await response.text()).toBe('%')
  })
  it('rejects malformed/multipart requests before accessing storage', async () => {
    expect((await call('bytes=0-5,10-20')).status).toBe(416)
    expect(find).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    [200, { 'content-length': '5' }],
    [206, { 'content-range': 'bytes 0-4/100', 'content-length': '5' }],
    [206, { 'content-range': 'bytes 5-9/100', 'content-length': '4' }],
  ])('rejects an ignored/inconsistent range (%s)', async (status, headers) => {
    vi.mocked(fetch).mockResolvedValue(new Response('12345', { status, headers }))
    expect((await call('bytes=5-9')).status).toBe(502)
  })
  it('retains full-stream fallback when upstream has no range support', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('%PDF-1.7\n'))
    const response = await call()
    expect(response.headers.get('accept-ranges')).toBeNull()
    expect(await response.text()).toBe('%PDF-1.7\n')
  })
  it.each([undefined, 123, { ...media, mimeType: 'image/png' }])(
    'does not serve missing/non-PDF relationships',
    async (digitalEdition) => {
      find.mockResolvedValue({ docs: [{ digitalEdition }] })
      expect((await call()).status).toBe(404)
      expect(fetch).not.toHaveBeenCalled()
    },
  )
  it('refuses foreign storage URLs, redirect failures and compressed representations', async () => {
    find.mockResolvedValueOnce({
      docs: [{ digitalEdition: { ...media, url: 'https://evil.example/a.pdf' } }],
    })
    expect((await call()).status).toBe(502)
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockRejectedValueOnce(new Error('redirect refused'))
    expect((await call()).status).toBe(502)
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('%PDF-', { headers: { 'content-encoding': 'gzip' } }),
    )
    expect((await call()).status).toBe(502)
  })
  it('cancels oversized and failed upstream bodies immediately', async () => {
    for (const options of [
      { status: 500 },
      { headers: { 'content-length': String(MAX_ISSUE_PDF_BYTES + 1) } },
    ]) {
      const cancel = vi.fn()
      vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), options))
      expect((await call()).status).toBeGreaterThanOrEqual(400)
      expect(cancel).toHaveBeenCalledOnce()
    }
  })
  it('propagates client abort and holds/reclaims slots through stream cancellation', async () => {
    const controller = new AbortController()
    const response = await call(undefined, { signal: controller.signal })
    controller.abort()
    expect(vi.mocked(fetch).mock.calls[0]![1]!.signal!.aborted).toBe(true)
    await expect(response.text()).rejects.toBeDefined()
    const pending = await Promise.all(Array.from({ length: 8 }, () => call()))
    expect((await call()).status).toBe(503)
    await pending[0]!.body!.cancel()
    const replacement = await call()
    expect(replacement.status).toBe(200)
    await replacement.text()
    for (const item of pending.slice(1)) await item.body!.cancel()
  })
  it('allows normal range request volume but rejects the 241st same-IP request', async () => {
    find.mockResolvedValue({ docs: [] })
    for (let i = 0; i < 240; i++) await call(undefined, { headers: { 'x-real-ip': '192.0.2.8' } })
    expect((await call(undefined, { headers: { 'x-real-ip': '192.0.2.8' } })).status).toBe(429)
    expect(find).toHaveBeenCalledTimes(240)
  })
  it('reclaims metadata slots on client abort and ignores late query results', async () => {
    let finish!: (value: unknown) => void
    find.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const controllers = Array.from({ length: 8 }, () => new AbortController())
    const pending = controllers.map((controller) => call(undefined, { signal: controller.signal }))
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(8))
    expect((await call()).status).toBe(503)
    controllers.forEach((controller) => controller.abort())
    expect((await Promise.all(pending)).every((response) => response.status === 502)).toBe(true)
    finish({ docs: [{ digitalEdition: media }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
    find.mockResolvedValue({ docs: [] })
    expect((await call()).status).toBe(404)
  })
  it('bounds a stalled metadata lookup by the request deadline', async () => {
    const controller = new AbortController()
    const deadline = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal)
    find.mockReturnValue(new Promise(() => {}))
    const pending = call()
    await vi.waitFor(() => expect(find).toHaveBeenCalled())
    controller.abort(new Error('deadline'))
    expect((await pending).status).toBe(502)
    expect(fetch).not.toHaveBeenCalled()
    deadline.mockRestore()
  })
  it('streams local byte ranges using bounded filesystem reads', async () => {
    vi.stubEnv('MEDIA_STORAGE_ADAPTER', 'local')
    vi.stubEnv('S3_ENDPOINT', 'https://ignored.example')
    realpath.mockResolvedValueOnce(MEDIA_ROOT).mockResolvedValueOnce(MEDIA_FILE)
    stat.mockResolvedValue({ size: 80_000_000 })
    createReadStream.mockReturnValue(Readable.from([Buffer.from('56789')]))
    const response = await call('bytes=5-9')
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 5-9/80000000')
    expect(createReadStream).toHaveBeenCalledWith(
      MEDIA_FILE,
      expect.objectContaining({ start: 5, end: 9, highWaterMark: 65536 }),
    )
    expect(await response.text()).toBe('56789')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects local path escapes and out-of-bounds ranges', async () => {
    vi.stubEnv('MEDIA_STORAGE_ADAPTER', 'local')
    realpath.mockResolvedValueOnce(MEDIA_ROOT).mockResolvedValueOnce(OUTSIDE_FILE)
    expect((await call()).status).toBe(404)
    realpath.mockResolvedValueOnce(MEDIA_ROOT).mockResolvedValueOnce(MEDIA_FILE)
    stat.mockResolvedValue({ size: 10 })
    const response = await call('bytes=10-')
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */10')
    expect(createReadStream).not.toHaveBeenCalled()
  })
})
