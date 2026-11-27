// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  issuesForLayout,
  layoutPrice,
  numbersUrl,
  parseNumbersReply,
  parseNumbersResponse,
  usePlaceNumbers,
  type NumbersIssue,
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

  it('builds the URL with the slug escaped, and the city when there is one', () => {
    expect(numbersUrl('north-lebanon')).toBe('/place-submissions/numbers?governorate=north-lebanon')
    expect(numbersUrl('matn', 'broummana')).toBe(
      '/place-submissions/numbers?governorate=matn&city=broummana',
    )
    expect(numbersUrl('north-lebanon', 'faqra-faraya')).toBe(
      '/place-submissions/numbers?governorate=north-lebanon&city=faqra-faraya',
    )
    expect(numbersUrl('matn', '')).toBe('/place-submissions/numbers?governorate=matn')
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

  function Probe({ governorate, city }: { governorate: string; city: string }) {
    seen = usePlaceNumbers(governorate, city)
    return null
  }

  // Most tests are about the governorate; any city will do for them.
  const render = (governorate: string, city = governorate ? 'town' : '') =>
    act(async () => {
      root.render(<Probe governorate={governorate} city={city} />)
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

  it('asks with the governorate alone for All Lebanon issues, whatever the city', async () => {
    const fetchMock = vi.fn(async (url: string) => ok(url))
    vi.stubGlobal('fetch', fetchMock)
    await render('beirut', '')
    expect(seen.state).toBe('ready')
    expect(seen.needsCity).toBe(false)
    expect(seen.issues[0]!.issueTitle).toBe('/place-submissions/numbers?governorate=beirut')
    expect(seen.issues[0]!.coverage).toBe('all-lebanon')
    await render('beirut', 'beirut')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(seen.state).toBe('ready')
  })

  describe('an issue split by city', () => {
    const routed = (url: string) =>
      url.includes('&city=')
        ? new Response(
            JSON.stringify({
              ok: true,
              issues: [
                {
                  issueId: 2,
                  issueTitle: url,
                  coverage: 'governorate',
                  from: 1,
                  to: 3,
                  taken: [],
                },
              ],
            }),
            { status: 200 },
          )
        : new Response(
            JSON.stringify({
              ok: true,
              issues: [
                { issueId: 2, issueTitle: 'Matn', coverage: 'governorate', from: null, to: null },
              ],
            }),
            { status: 200 },
          )

    it('waits for the city, then asks for it, and again when it changes', async () => {
      const fetchMock = vi.fn(async (url: string) => routed(url))
      vi.stubGlobal('fetch', fetchMock)
      await render('matn', '')
      expect(seen).toMatchObject({ state: 'idle', needsCity: true, issues: [] })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await render('matn', 'broummana')
      expect(seen.needsCity).toBe(true)
      expect(seen.issues[0]!.issueTitle).toBe(
        '/place-submissions/numbers?governorate=matn&city=broummana',
      )
      expect(seen.issues[0]!.coverage).toBe('governorate')
      await render('matn', 'dbayeh')
      expect(seen.issues[0]!.issueTitle).toBe(
        '/place-submissions/numbers?governorate=matn&city=dbayeh',
      )
    })

    it('ignores a slow answer for a city the owner already left', async () => {
      let releaseFirst: (r: Response) => void = () => {}
      const first = new Promise<Response>((resolve) => (releaseFirst = resolve))
      const fetchMock = vi.fn(async (url: string) =>
        url.endsWith('city=broummana') ? first : routed(url),
      )
      vi.stubGlobal('fetch', fetchMock)
      await render('matn', 'broummana')
      await render('matn', 'dbayeh')
      await act(async () => releaseFirst(routed('/x?governorate=matn&city=broummana')))
      expect(seen.issues[0]!.issueTitle).toBe(
        '/place-submissions/numbers?governorate=matn&city=dbayeh',
      )
    })
  })

  it('reads the need for a city from the reply, leaving the empty entry out', () => {
    expect(
      parseNumbersReply({
        ok: true,
        issues: [
          { issueId: 2, issueTitle: 'Matn', coverage: 'governorate', from: null, to: null },
          { issueId: 1, issueTitle: 'All', from: 1, to: 3, taken: [] },
        ],
      }),
    ).toEqual({
      needsCity: true,
      issues: [
        {
          issueId: 1,
          issueTitle: 'All',
          coverage: 'all-lebanon',
          from: 1,
          to: 3,
          taken: [],
          currency: '',
          layouts: [],
        },
      ],
    })
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
