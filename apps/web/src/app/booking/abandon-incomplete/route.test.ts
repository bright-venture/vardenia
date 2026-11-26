import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../../../lib/place-abandon', () => ({ abandonIncomplete: vi.fn() }))

const { POST } = await import('./route')
const { abandonIncomplete } = await import('../../../lib/place-abandon')

const call = (authorization?: string) =>
  POST(
    new Request('http://x/booking/abandon-incomplete', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    }),
  )

beforeEach(() => {
  vi.mocked(abandonIncomplete).mockReset()
  process.env.CRON_SECRET = 'sched-secret'
})

describe('POST /booking/abandon-incomplete', () => {
  it('is a 404 without the scheduler secret, and does nothing', async () => {
    for (const header of [undefined, 'Bearer wrong', 'sched-secret']) {
      const r = await call(header)
      expect(r.status).toBe(404)
    }
    expect(abandonIncomplete).not.toHaveBeenCalled()
  })

  it('is a 404 when no secret is configured at all', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer ')).status).toBe(404)
    expect(abandonIncomplete).not.toHaveBeenCalled()
  })

  it('runs the job with the secret and returns the counts', async () => {
    vi.mocked(abandonIncomplete).mockResolvedValue({
      abandoned: 2,
      skipped: 0,
      mediaDeleted: 4,
      failed: 0,
      mediaFailed: 0,
    })
    const r = await call('Bearer sched-secret')
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.json()).toEqual({
      ok: true,
      abandoned: 2,
      skipped: 0,
      mediaDeleted: 4,
      failed: 0,
      mediaFailed: 0,
    })
  })

  it('answers 500 when the job throws', async () => {
    vi.mocked(abandonIncomplete).mockRejectedValue(new Error('db down'))
    expect((await call('Bearer sched-secret')).status).toBe(500)
  })
})
