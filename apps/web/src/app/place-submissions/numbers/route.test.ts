import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))
vi.mock('../../../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../../../lib/place-submission', () => ({ listNumbersFor: vi.fn() }))

const { GET } = await import('./route')
const { listNumbersFor } = await import('../../../lib/place-submission')
const { reportError } = await import('../../../lib/report')

const get = async (query: string) => {
  const response = await (GET as unknown as (request: Request) => Promise<Response>)(
    new Request(`http://x/place-submissions/numbers${query}`),
  )
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as Record<string, unknown>,
  }
}

const ISSUES = [
  {
    issueId: 7,
    issueTitle: 'Summer',
    coverage: 'all-lebanon',
    from: 10,
    to: 20,
    taken: [11],
    layouts: [
      {
        layout: 'half-page',
        price: 300,
        downpaymentAmount: 150,
        slots: [{ number: 10, page: 10, position: 1, lastPage: 10 }],
        free: 1,
      },
    ],
  },
]

beforeEach(() => {
  vi.mocked(listNumbersFor).mockReset()
  vi.mocked(reportError).mockClear()
})

describe('GET /place-submissions/numbers', () => {
  it.each([
    '',
    '?governorate=beirut',
    '?issue=0&governorate=beirut',
    '?issue=x&governorate=beirut',
    '?issue=1.5&governorate=beirut',
  ])('refuses a missing or invalid issue (%s) with 400, reading nothing', async (query) => {
    const r = await get(query)
    expect(r.status).toBe(400)
    expect(r.body).toEqual({ ok: false, message: 'Choose an issue.' })
    expect(listNumbersFor).not.toHaveBeenCalled()
  })

  it('refuses an issue with no place, an unknown governorate or an unknown city, reading nothing', async () => {
    expect((await get('?issue=7')).status).toBe(400)
    expect((await get('?issue=7&governorate=&city=')).status).toBe(400)
    expect((await get('?issue=7&governorate=atlantis')).status).toBe(400)
    expect((await get('?issue=7&city=atlantis')).status).toBe(400)
    expect(listNumbersFor).not.toHaveBeenCalled()
  })

  it("answers with the issue's block, its layouts and their free slots, uncached", async () => {
    vi.mocked(listNumbersFor).mockResolvedValue(ISSUES as never)
    const r = await get('?issue=7&governorate=beirut')
    expect(r.status).toBe(200)
    expect(r.cache).toBe('no-store')
    expect(r.body).toEqual({ ok: true, issues: ISSUES })
    expect(vi.mocked(listNumbersFor).mock.calls[0]!.slice(1)).toEqual([
      7,
      { governorate: 'beirut', city: undefined },
    ])
  })

  it('passes a city on alone; the issue decides which of the two counts', async () => {
    vi.mocked(listNumbersFor).mockResolvedValue([] as never)
    await get('?issue=8&city=broummana')
    expect(vi.mocked(listNumbersFor).mock.calls[0]!.slice(1)).toEqual([
      8,
      { governorate: undefined, city: 'broummana' },
    ])
    await get('?issue=8&governorate=beirut&city=')
    expect(vi.mocked(listNumbersFor).mock.calls[1]!.slice(1)).toEqual([
      8,
      { governorate: 'beirut', city: undefined },
    ])
  })

  it('reports a failure and answers 500 without details', async () => {
    vi.mocked(listNumbersFor).mockRejectedValue(new Error('db down'))
    const r = await get('?issue=7&governorate=beirut')
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toContain('db down')
    expect(reportError).toHaveBeenCalled()
  })
})
