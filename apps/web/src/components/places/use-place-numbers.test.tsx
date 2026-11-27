// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  issuesForLayout,
  layoutPrice,
  numbersUrl,
  parseNumbersResponse,
  usePlaceNumbers,
  type NumbersIssue,
  type NumbersQuery,
} from './use-place-numbers'

const slot = (number: number, page: number, position: number | null = null, lastPage = page) => ({
  number,
  page,
  position,
  lastPage,
})

describe('parseNumbersResponse', () => {
  it('reads the route reply, a legacy issue with no layouts included', () => {
    expect(
      parseNumbersResponse({
        ok: true,
        issues: [
          { issueId: 1, issueTitle: 'All Lebanon', from: 1, to: 90, taken: [3, 'x'], layouts: [] },
        ],
      }),
    ).toEqual([
      {
        issueId: 1,
        issueTitle: 'All Lebanon',
        // No coverage in the reply: All Lebanon.
        coverage: 'all-lebanon',
        from: 1,
        to: 90,
        taken: [3],
        currency: '',
        layouts: [],
      },
    ])
  })

  it('keeps the layouts in the order the form lists them, with their free slots', () => {
    const [issue] = parseNumbersResponse({
      ok: true,
      issues: [
        {
          issueId: 2,
          issueTitle: 'Summer',
          from: 1,
          to: 9,
          taken: [],
          currency: 'USD',
          layouts: [
            {
              layout: 'half-page',
              price: 300,
              downpaymentAmount: 150,
              slots: [slot(4, 3, 1), slot(5, 3, 2)],
              free: 2,
            },
            {
              layout: 'full-spread',
              price: 900,
              downpaymentAmount: 450,
              slots: [slot(1, 1, null, 2)],
              free: 1,
            },
          ],
        },
      ],
    })!
    expect(issue!.currency).toBe('USD')
    expect(issue!.layouts).toEqual([
      {
        layout: 'full-spread',
        price: 900,
        downpaymentAmount: 450,
        slots: [slot(1, 1, null, 2)],
        free: 1,
      },
      {
        layout: 'half-page',
        price: 300,
        downpaymentAmount: 150,
        slots: [slot(4, 3, 1), slot(5, 3, 2)],
        free: 2,
      },
    ])
  })

  it('drops a malformed layout or slot rather than offering it', () => {
    const [issue] = parseNumbersResponse({
      ok: true,
      issues: [
        {
          issueId: 2,
          issueTitle: '',
          from: 1,
          to: 9,
          taken: [],
          layouts: [
            { layout: 'poster', price: 100, downpaymentAmount: 50, slots: [slot(1, 1)], free: 1 },
            { layout: 'full-page', price: 'x', downpaymentAmount: 50, slots: [], free: 0 },
            null,
            {
              layout: 'quarter-page',
              price: 100,
              downpaymentAmount: 50,
              slots: [slot(6, 4, 1), { number: 'x', page: 4 }, slot(7, 0, 2), slot(8, 4, 3, 2)],
              free: 9,
            },
          ],
        },
      ],
    })!
    expect(issue!.layouts).toEqual([
      {
        layout: 'quarter-page',
        price: 100,
        downpaymentAmount: 50,
        slots: [slot(6, 4, 1)],
        free: 1,
      },
    ])
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

  it('builds the URL from the issue and its place: the governorate, or the city', () => {
    expect(numbersUrl({ issueId: 7, governorate: 'north-lebanon' })).toBe(
      '/place-submissions/numbers?issue=7&governorate=north-lebanon',
    )
    expect(numbersUrl({ issueId: 8, city: 'faqra-faraya' })).toBe(
      '/place-submissions/numbers?issue=8&city=faqra-faraya',
    )
    expect(numbersUrl({ issueId: 8, city: 'a b&c' })).toBe(
      '/place-submissions/numbers?issue=8&city=a%20b%26c',
    )
  })

  it('keeps the coverage of the reply', () => {
    const [issue] = parseNumbersResponse({
      ok: true,
      issues: [{ issueId: 2, coverage: 'governorate', from: 1, to: 3, taken: [] }],
    })!
    expect(issue!.coverage).toBe('governorate')
  })
})

describe('issuesForLayout', () => {
  const issues: NumbersIssue[] = [
    {
      issueId: 1,
      issueTitle: 'Legacy',
      coverage: 'all-lebanon',
      from: 1,
      to: 9,
      taken: [],
      currency: 'USD',
      layouts: [],
    },
    {
      issueId: 2,
      issueTitle: 'Summer',
      coverage: 'all-lebanon',
      from: 1,
      to: 9,
      taken: [],
      currency: 'USD',
      layouts: [
        {
          layout: 'full-page',
          price: 500,
          downpaymentAmount: 250,
          slots: [slot(2, 3)],
          free: 1,
        },
        {
          layout: 'half-page',
          price: 300,
          downpaymentAmount: 150,
          slots: [slot(4, 4, 1)],
          free: 1,
        },
      ],
    },
  ]

  it('offers nothing while no layout is chosen', () => {
    expect(issuesForLayout(issues, null)).toEqual([])
  })

  it("gives each issue that offers the layout, with that layout's price and free slots", () => {
    expect(issuesForLayout(issues, 'half-page')).toEqual([
      {
        issueId: 2,
        issueTitle: 'Summer',
        currency: 'USD',
        price: 300,
        downpaymentAmount: 150,
        slots: [slot(4, 4, 1)],
      },
    ])
  })

  it('offers nothing for a layout no issue has (a legacy issue never offers one)', () => {
    expect(issuesForLayout(issues, 'full-spread')).toEqual([])
  })
})

describe('usePlaceNumbers', () => {
  let container: HTMLDivElement
  let root: Root
  let seen: ReturnType<typeof usePlaceNumbers>

  function Probe({ query }: { query: NumbersQuery | null }) {
    seen = usePlaceNumbers(query)
    return null
  }

  const render = (query: NumbersQuery | null) =>
    act(async () => {
      root.render(<Probe query={query} />)
    })
  const beirut: NumbersQuery = { issueId: 7, governorate: 'beirut' }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })

  /** A reply whose issue title is the URL asked, to tell the answers apart. */
  const ok = (url: string) =>
    new Response(
      JSON.stringify({
        ok: true,
        issues: [{ issueId: 1, issueTitle: url, from: 1, to: 3, taken: [] }],
      }),
      { status: 200 },
    )

  it('is idle until the issue and its place are chosen, and does not fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await render(null)
    expect(seen.state).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads, then is ready, fetching the issue and place with no-store', async () => {
    const fetchMock = vi.fn(async (url: string) => ok(url))
    vi.stubGlobal('fetch', fetchMock)
    await render(beirut)
    expect(seen.state).toBe('ready')
    expect(seen.issues[0]!.issueTitle).toBe('/place-submissions/numbers?issue=7&governorate=beirut')
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.cache).toBe('no-store')
  })

  it('asks again when the issue or the place changes', async () => {
    const fetchMock = vi.fn(async (url: string) => ok(url))
    vi.stubGlobal('fetch', fetchMock)
    await render({ issueId: 8, city: 'broummana' })
    await render({ issueId: 8, city: 'dbayeh' })
    expect(seen.issues[0]!.issueTitle).toBe('/place-submissions/numbers?issue=8&city=dbayeh')
    await render({ issueId: 9, city: 'dbayeh' })
    expect(seen.issues[0]!.issueTitle).toBe('/place-submissions/numbers?issue=9&city=dbayeh')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports an error for a refusal or a broken network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Too many', { status: 429 })),
    )
    await render(beirut)
    expect(seen.state).toBe('error')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    await render({ issueId: 7, governorate: 'matn' })
    expect(seen.state).toBe('error')
  })

  it('ignores a slow answer for a place the owner already left', async () => {
    let releaseFirst: (r: Response) => void = () => {}
    const first = new Promise<Response>((resolve) => (releaseFirst = resolve))
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(async () => ok('beirut'))
    vi.stubGlobal('fetch', fetchMock)
    await render({ issueId: 7, governorate: 'keserwan' })
    expect(seen.state).toBe('loading')
    await render(beirut)
    expect(seen.issues[0]!.issueTitle).toBe('beirut')
    await act(async () => releaseFirst(ok('keserwan')))
    expect(seen.state).toBe('ready')
    expect(seen.issues[0]!.issueTitle).toBe('beirut')
  })

  it('fetches again on reload', async () => {
    const fetchMock = vi.fn(async () => ok('chouf'))
    vi.stubGlobal('fetch', fetchMock)
    await render(beirut)
    await act(async () => seen.reload())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(seen.state).toBe('ready')
  })
})

/** PRD v7 section 9: the price beside each layout in the size choice. */
describe('layoutPrice', () => {
  const issue = (issueId: number, prices: Record<string, number>): NumbersIssue => ({
    issueId,
    issueTitle: `Issue ${issueId}`,
    coverage: 'all-lebanon',
    from: 1,
    to: 9,
    taken: [],
    currency: 'USD',
    layouts: Object.entries(prices).map(([layout, price]) => ({
      layout: layout as NumbersIssue['layouts'][number]['layout'],
      price,
      downpaymentAmount: price / 2,
      free: 1,
      slots: [slot(1, 1)],
    })),
  })

  it('shows the layout price of the one issue offering it', () => {
    expect(layoutPrice([issue(1, { 'half-page': 800 })], 'half-page')).toEqual({
      amount: 800,
      currency: 'USD',
      from: false,
    })
  })

  it('shows nothing for a layout no issue offers in the region', () => {
    expect(layoutPrice([issue(1, { 'half-page': 800 })], 'three-third')).toBeNull()
    expect(layoutPrice([], 'half-page')).toBeNull()
  })

  it('shows the lowest price, marked from, when issues price it differently', () => {
    expect(
      layoutPrice([issue(1, { 'full-page': 1500 }), issue(2, { 'full-page': 1200 })], 'full-page'),
    ).toEqual({ amount: 1200, currency: 'USD', from: true })
  })

  it('is not marked from when every issue asks the same', () => {
    expect(
      layoutPrice([issue(1, { 'full-page': 1500 }), issue(2, { 'full-page': 1500 })], 'full-page')
        ?.from,
    ).toBe(false)
  })
})
