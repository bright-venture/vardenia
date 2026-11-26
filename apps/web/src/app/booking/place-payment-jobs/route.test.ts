import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../../../lib/place-payment-jobs', () => ({ runPaymentJobs: vi.fn() }))

const { POST } = await import('./route')
const { runPaymentJobs } = await import('../../../lib/place-payment-jobs')
const { reportError } = await import('../../../lib/report')

const call = (authorization?: string) =>
  POST(
    new Request('http://x/booking/place-payment-jobs', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    }),
  )

const COUNTS = {
  lapsed: 1,
  rejectedUnpaid: 0,
  downpaymentReminders: 2,
  balanceReminders: 0,
  publishedEmails: 0,
  skipped: 0,
  failed: 0,
}

beforeEach(() => {
  vi.mocked(runPaymentJobs).mockReset()
  vi.mocked(reportError).mockClear()
  process.env.CRON_SECRET = 'sched-secret'
})

describe('POST /booking/place-payment-jobs', () => {
  it('is a 404 without the scheduler secret, and does nothing', async () => {
    for (const header of [undefined, 'Bearer wrong', 'sched-secret', 'Basic sched-secret']) {
      expect((await call(header)).status).toBe(404)
    }
    expect(runPaymentJobs).not.toHaveBeenCalled()
  })

  it('is a 404 when no secret is configured at all', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer ')).status).toBe(404)
    expect((await call('Bearer undefined')).status).toBe(404)
    expect(runPaymentJobs).not.toHaveBeenCalled()
  })

  it('runs the jobs with the secret and returns the counts', async () => {
    vi.mocked(runPaymentJobs).mockResolvedValue(COUNTS)
    const r = await call('Bearer sched-secret')
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.json()).toEqual({ ok: true, ...COUNTS })
    expect(reportError).not.toHaveBeenCalled()
  })

  it('reports failures but still answers with the counts', async () => {
    vi.mocked(runPaymentJobs).mockResolvedValue({ ...COUNTS, failed: 2 })
    const r = await call('Bearer sched-secret')
    expect(r.status).toBe(200)
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'place.payment-jobs' }),
    )
  })

  it('answers 500 when the run throws', async () => {
    vi.mocked(runPaymentJobs).mockRejectedValue(new Error('db down'))
    expect((await call('Bearer sched-secret')).status).toBe(500)
  })
})
