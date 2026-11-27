import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))
vi.mock('../../../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../../../lib/magazine-view', () => ({ loadMagazine: vi.fn() }))

const { GET } = await import('./route')
const { loadMagazine } = await import('../../../lib/magazine-view')
const { reportError } = await import('../../../lib/report')

const get = async (query: string) => {
  const response = await (GET as unknown as (request: Request) => Promise<Response>)(
    new Request(`http://x/place-submissions/magazine${query}`),
  )
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as Record<string, unknown>,
  }
}

const DATA = {
  issue: { id: 9, title: 'Summer' },
  pages: [{ page: 1, kind: 'editorial', note: null }],
  regions: [],
  businesses: [],
}

beforeEach(() => {
  vi.mocked(loadMagazine).mockReset()
  vi.mocked(reportError).mockClear()
})

describe('GET /place-submissions/magazine', () => {
  it('answers the magazine, uncached, in a known locale', async () => {
    vi.mocked(loadMagazine).mockResolvedValue(DATA as never)
    const r = await get('?issue=9&locale=ar')
    expect(r.status).toBe(200)
    expect(r.cache).toBe('no-store')
    expect(r.body).toEqual({ ok: true, ...DATA })
    expect(vi.mocked(loadMagazine).mock.calls[0]!.slice(1)).toEqual([9, 'ar'])
  })

  it('ignores an unknown locale', async () => {
    vi.mocked(loadMagazine).mockResolvedValue(DATA as never)
    await get('?issue=9&locale=xx')
    expect(vi.mocked(loadMagazine).mock.calls[0]![2]).toBeUndefined()
  })

  it.each(['', '?issue=', '?issue=0', '?issue=abc', '?issue=1e3', '?issue=99999999999'])(
    'refuses a missing or invalid issue (%s) with 400, reading nothing',
    async (query) => {
      const r = await get(query)
      expect(r.status).toBe(400)
      expect(r.cache).toBe('no-store')
      expect(loadMagazine).not.toHaveBeenCalled()
    },
  )

  it('answers 404 for an unknown issue and 409 for one without slots', async () => {
    vi.mocked(loadMagazine).mockResolvedValueOnce({ problem: 'not-found' })
    const missing = await get('?issue=9')
    expect(missing.status).toBe(404)
    expect(missing.body.problem).toBe('not-found')
    vi.mocked(loadMagazine).mockResolvedValueOnce({ problem: 'no-slots' })
    const empty = await get('?issue=9')
    expect(empty.status).toBe(409)
    expect(empty.body.problem).toBe('no-slots')
    expect(empty.cache).toBe('no-store')
  })

  it('reports a failure and answers 500 without details', async () => {
    vi.mocked(loadMagazine).mockRejectedValue(new Error('db down'))
    const r = await get('?issue=9')
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toContain('db down')
    expect(reportError).toHaveBeenCalled()
  })
})
