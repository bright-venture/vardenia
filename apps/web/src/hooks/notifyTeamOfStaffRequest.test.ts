import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))

const { notifyTeamOfStaffRequest } = await import('./notifyTeamOfStaffRequest')
const { reportError } = await import('../lib/report')

const doc = {
  id: 4,
  reference: 'ES-1234',
  role: 'hostesses',
  name: 'Rana',
  email: 'rana@example.com',
  eventType: 'Wedding',
  guests: 120,
  eventDate: '2026-12-12',
  venue: 'Jounieh',
}

const setup = (sendFails = false) => {
  const sendEmail = vi.fn(async () => {
    if (sendFails) throw new Error('provider down')
  })
  const find = vi.fn(async () => ({ docs: [{ email: 'team@vardenia.test' }] }))
  const req = { payload: { find, sendEmail } }
  const run = (operation = 'create') => notifyTeamOfStaffRequest({ doc, operation, req } as never)
  return { sendEmail, run }
}

beforeEach(() => vi.mocked(reportError).mockClear())

describe('the team email for a new Event Staff request', () => {
  it('emails the team on a new request and reports nothing', async () => {
    const { sendEmail, run } = setup()
    await run()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('reports a failed send, with the reference, and still keeps the request', async () => {
    const { run } = setup(true)
    await expect(run()).resolves.toBe(doc)
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        source: 'staff-request.team-email',
        extra: { reference: 'ES-1234' },
      }),
    )
  })

  it('sends nothing when a request is only updated', async () => {
    const { sendEmail, run } = setup()
    await run('update')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
