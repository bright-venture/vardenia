import { afterEach, describe, expect, it, vi } from 'vitest'
import { openByRanges, RANGE_CHUNK, totalFromContentRange } from './pdf-range'

/** Stand-in for PDF.js's PDFDataRangeTransport: records what it is given. */
class FakeTransport {
  ranges: [number, Uint8Array | null][] = []
  constructor(
    public length: number,
    public initialData: Uint8Array | null,
  ) {}
  onDataRange(begin: number, chunk: Uint8Array | null) {
    this.ranges.push([begin, chunk])
  }
  requestDataRange(begin: number, end: number): void {
    throw new Error(`not overridden (${begin}-${end})`)
  }
}
const Transport = FakeTransport as unknown as typeof import('pdfjs-dist').PDFDataRangeTransport

const partial = (start: number, bytes: number, total: number) =>
  new Response(new Uint8Array(bytes), {
    status: 206,
    headers: { 'Content-Range': `bytes ${start}-${start + bytes - 1}/${total}` },
  })

afterEach(() => vi.unstubAllGlobals())

describe('totalFromContentRange', () => {
  it('reads the total from a byte range', () => {
    expect(totalFromContentRange('bytes 0-1023/42112573')).toBe(42112573)
  })
  it('refuses anything else', () => {
    expect(totalFromContentRange(null)).toBeNull()
    expect(totalFromContentRange('bytes */500')).toBeNull()
    expect(totalFromContentRange('bytes 0-9/0')).toBeNull()
  })
})

describe('openByRanges', () => {
  it('opens with the first chunk and fetches later pieces as ranges', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string>).Range!
      const [start, end] = range.slice(6).split('-').map(Number) as [number, number]
      return partial(start, end - start + 1, 5_000_000)
    })
    vi.stubGlobal('fetch', fetchMock)

    const transport = (await openByRanges(
      Transport,
      '/read/issue/x',
      new AbortController().signal,
    )) as unknown as FakeTransport
    expect(transport.length).toBe(5_000_000)
    expect(transport.initialData?.length).toBe(RANGE_CHUNK)
    expect(fetchMock.mock.calls[0]![1]!.headers).toEqual({ Range: `bytes=0-${RANGE_CHUNK - 1}` })

    // PDF.js passes an exclusive end; the header carries an inclusive one.
    transport.requestDataRange(2_000_000, 2_100_000)
    await vi.waitFor(() => expect(transport.ranges).toHaveLength(1))
    expect(fetchMock.mock.calls[1]![1]!.headers).toEqual({ Range: 'bytes=2000000-2099999' })
    expect(transport.ranges[0]![0]).toBe(2_000_000)
    expect(transport.ranges[0]![1]?.length).toBe(100_000)
  })

  it('gives up, so the reader can open the plain URL, when ranges are not answered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(10), { status: 200 })),
    )
    expect(await openByRanges(Transport, '/read/issue/x', new AbortController().signal)).toBeNull()
  })

  it('retries a piece that failed once', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls += 1
        if (calls === 2) return new Response(null, { status: 502 })
        const range = (init?.headers as Record<string, string>).Range!
        const [start, end] = range.slice(6).split('-').map(Number) as [number, number]
        return partial(start, end - start + 1, 5_000_000)
      }),
    )
    const transport = (await openByRanges(
      Transport,
      '/x',
      new AbortController().signal,
    )) as unknown as FakeTransport
    transport.requestDataRange(3_000_000, 3_000_100)
    await vi.waitFor(() => expect(transport.ranges).toHaveLength(1), { timeout: 3000 })
    expect(calls).toBe(3)
  })
})
