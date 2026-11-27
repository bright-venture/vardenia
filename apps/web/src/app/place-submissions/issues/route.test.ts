import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))
vi.mock('../../../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../../../lib/place-submission', () => ({ openIssues: vi.fn(), issuePlaces: vi.fn() }))

const { GET } = await import('./route')
const { openIssues, issuePlaces } = await import('../../../lib/place-submission')
const { reportError } = await import('../../../lib/report')

const get = async (query: string) => {
  const response = await (GET as unknown as (request: Request) => Promise<Response>)(
    new Request(`http://x/place-submissions/issues${query}`),
  )
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as Record<string, unknown>,
  }
}

const ISSUES = [
  { issueId: 9, title: 'Matn', coverage: 'governorate', governorate: 'matn' },
  { issueId: 7, title: 'Summer', coverage: 'all-lebanon', governorate: null },
]
const PLACES = [
  { governorate: 'matn', city: 'dbayeh', free: 0 },
  { governorate: 'matn', city: 'broummana', free: 4 },
]

beforeEach(() => {
  vi.mocked(openIssues).mockReset()
  vi.mocked(issuePlaces).mockReset()
  vi.mocked(reportError).mockClear()
})

describe('GET /place-submissions/issues', () => {
  it('lists the open issues, uncached, in a known locale', async () => {
    vi.mocked(openIssues).mockResolvedValue(ISSUES as never)
    const r = await get('?locale=ar')
    expect(r.status).toBe(200)
    expect(r.cache).toBe('no-store')
    expect(r.body).toEqual({ ok: true, issues: ISSUES })
    expect(vi.mocked(openIssues).mock.calls[0]![1]).toBe('ar')
    expect(issuePlaces).not.toHaveBeenCalled()
  })

  it('ignores an unknown locale', async () => {
    vi.mocked(openIssues).mockResolvedValue([] as never)
    await get('?locale=xx')
    await get('')
    expect(vi.mocked(openIssues).mock.calls.map((c) => c[1])).toEqual([undefined, undefined])
  })

  it("answers an issue's places with their free counts", async () => {
    vi.mocked(issuePlaces).mockResolvedValue(PLACES as never)
    const r = await get('?issue=9')
    expect(r.status).toBe(200)
    expect(r.cache).toBe('no-store')
    expect(r.body).toEqual({ ok: true, places: PLACES })
    expect(vi.mocked(issuePlaces).mock.calls[0]![1]).toBe(9)
    expect(openIssues).not.toHaveBeenCalled()
  })

  it.each([
    '?issue=',
    '?issue=0',
    '?issue=-3',
    '?issue=abc',
    '?issue=1e3',
    '?issue=2147483648',
    '?issue=99999999999',
  ])('refuses an invalid issue (%s) with 400, reading nothing', async (query) => {
    const r = await get(query)
    expect(r.status).toBe(400)
    expect(r.body).toEqual({ ok: false, message: 'Choose an issue.' })
    expect(issuePlaces).not.toHaveBeenCalled()
    expect(openIssues).not.toHaveBeenCalled()
  })

  it('reports a failure and answers 500 without details', async () => {
    vi.mocked(issuePlaces).mockRejectedValue(new Error('db down'))
    const r = await get('?issue=9')
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toContain('db down')
    expect(reportError).toHaveBeenCalled()
  })
})
