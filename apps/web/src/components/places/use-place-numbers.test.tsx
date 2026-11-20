// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { numbersUrl, parseNumbersResponse, usePlaceNumbers } from './use-place-numbers'

describe('parseNumbersResponse', () => {
  it('reads the route reply', () => {
    expect(
      parseNumbersResponse({
        ok: true,
        issues: [{ issueId: 1, issueTitle: 'All Lebanon', from: 1, to: 90, taken: [3, 'x'] }],
      }),
    ).toEqual([{ issueId: 1, issueTitle: 'All Lebanon', from: 1, to: 90, taken: [3] }])
  })

  it('refuses anything else', () => {
    expect(parseNumbersResponse(null)).toBeNull()
    expect(parseNumbersResponse('Too many requests')).toBeNull()
    expect(parseNumbersResponse({ ok: false, message: 'x' })).toBeNull()
    expect(parseNumbersResponse({ ok: true, issues: 'x' })).toBeNull()
  })

  it('drops a malformed issue rather than drawing a broken range', () => {
    expect(
      parseNumbersResponse({
        ok: true,
        issues: [
          { issueId: 1, issueTitle: '', from: 10, to: 5, taken: [] },
          { issueId: 'x', from: 1, to: 2, taken: [] },
        ],
      }),
    ).toEqual([])
  })

  it('builds the URL with the slug escaped', () => {
    expect(numbersUrl('north-lebanon')).toBe('/place-submissions/numbers?governorate=north-lebanon')
  })
})

describe('usePlaceNumbers', () => {
  let container: HTMLDivElement
  let root: Root
  let seen: ReturnType<typeof usePlaceNumbers>

  function Probe({ governorate }: { governorate: string }) {
    seen = usePlaceNumbers(governorate)
    return null
  }

  const render = (governorate: string) =>
    act(async () => {
      root.render(<Probe governorate={governorate} />)
    })

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })

  const ok = (gov: string) =>
    new Response(
      JSON.stringify({
        ok: true,
        issues: [{ issueId: 1, issueTitle: gov, from: 1, to: 3, taken: [] }],
      }),
      { status: 200 },
    )

  it('is idle without a governorate and does not fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await render('')
    expect(seen.state).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads, then is ready, fetching with no-store', async () => {
    const fetchMock = vi.fn(async () => ok('keserwan'))
    vi.stubGlobal('fetch', fetchMock)
    await render('keserwan')
    expect(seen.state).toBe('ready')
    expect(seen.issues[0]!.issueTitle).toBe('keserwan')
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.cache).toBe('no-store')
  })

  it('reports an error for a refusal or a broken network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Too many', { status: 429 })),
    )
    await render('beirut')
    expect(seen.state).toBe('error')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    await render('matn')
    expect(seen.state).toBe('error')
  })

  it('ignores a slow answer for a governorate the owner already left', async () => {
    let releaseFirst: (r: Response) => void = () => {}
    const first = new Promise<Response>((resolve) => (releaseFirst = resolve))
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(async () => ok('beirut'))
    vi.stubGlobal('fetch', fetchMock)
    await render('keserwan')
    expect(seen.state).toBe('loading')
    await render('beirut')
    expect(seen.issues[0]!.issueTitle).toBe('beirut')
    await act(async () => releaseFirst(ok('keserwan')))
    expect(seen.state).toBe('ready')
    expect(seen.issues[0]!.issueTitle).toBe('beirut')
  })

  it('fetches again on reload', async () => {
    const fetchMock = vi.fn(async () => ok('chouf'))
    vi.stubGlobal('fetch', fetchMock)
    await render('chouf')
    await act(async () => seen.reload())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(seen.state).toBe('ready')
  })
})
