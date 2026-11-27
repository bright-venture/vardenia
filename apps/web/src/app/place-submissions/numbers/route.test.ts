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
  // An issue for one governorate asked without a city: the form must ask for one.
  {
    issueId: 8,
    issueTitle: 'Matn',
    coverage: 'governorate',
    from: null,
    to: null,
    taken: [],
    layouts: [],
  },
]

beforeEach(() => {
  vi.mocked(listNumbersFor).mockReset()
  vi.mocked(reportError).mockClear()
})

describe('GET /place-submissions/numbers', () => {
  it('refuses an unknown governorate with 400, reading nothing', async () => {
    const r = await get('?governorate=atlantis')
    expect(r.status).toBe(400)
    expect(listNumbersFor).not.toHaveBeenCalled()
  })

  it('answers with each issue, its layouts and their free slots, uncached', async () => {
    vi.mocked(listNumbersFor).mockResolvedValue(ISSUES as never)
    const r = await get('?governorate=beirut')
    expect(r.status).toBe(200)
    expect(r.cache).toBe('no-store')
    expect(r.body).toEqual({ ok: true, issues: ISSUES })
    expect(vi.mocked(listNumbersFor).mock.calls[0]![1]).toBe('beirut')
  })

  it('passes a known city of the governorate on, and no city as undefined', async () => {
    vi.mocked(listNumbersFor).mockResolvedValue([] as never)
    await get('?governorate=matn&city=broummana')
    expect(vi.mocked(listNumbersFor).mock.calls[0]!.slice(1)).toEqual(['matn', 'broummana'])
    await get('?governorate=matn')
    expect(vi.mocked(listNumbersFor).mock.calls[1]!.slice(1)).toEqual(['matn', undefined])
    await get('?governorate=matn&city=')
    expect(vi.mocked(listNumbersFor).mock.calls[2]!.slice(1)).toEqual(['matn', undefined])
  })

  it('refuses a city that is not in the governorate with 400, reading nothing', async () => {
    for (const query of ['?governorate=matn&city=jounieh', '?governorate=matn&city=atlantis']) {
      const r = await get(query)
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ ok: false, message: 'Choose a city of that governorate.' })
    }
    expect(listNumbersFor).not.toHaveBeenCalled()
  })

  it('reports a failure and answers 500 without details', async () => {
    vi.mocked(listNumbersFor).mockRejectedValue(new Error('db down'))
    const r = await get('?governorate=beirut')
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toContain('db down')
    expect(reportError).toHaveBeenCalled()
  })
})
