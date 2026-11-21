import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))

const { inviteBusinessUser } = await import('./inviteBusinessUser')
const { reportError } = await import('../lib/report')
const { PARTNER_INVITE_DAYS, PARTNER_INVITE_MS } = await import('../lib/auth-email')

const setup = (token: string | null, sendFails = false) => {
  const forgotPassword = vi.fn(async () => token)
  const sendEmail = vi.fn(async () => {
    if (sendFails) throw new Error('provider down')
  })
  const req = { payload: { forgotPassword, sendEmail }, context: {} }
  const run = (operation = 'create', email = 'owner@example.com') =>
    inviteBusinessUser({ doc: { id: 7, email }, operation, req } as never)
  return { forgotPassword, sendEmail, req, run }
}

beforeEach(() => vi.mocked(reportError).mockClear())

/**
 * The invitation must work inside the create that makes the account (20
 * November 2026). Payload's own email path skipped every one of them.
 */
describe('the partner invitation', () => {
  it('asks Payload only for the token, in this transaction, with the invitation lifetime', async () => {
    const { forgotPassword, req, run } = setup('tok123')
    await run()
    expect(forgotPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'business-users',
        data: { email: 'owner@example.com' },
        disableEmail: true,
        expiration: PARTNER_INVITE_MS,
        req,
      }),
    )
  })

  it('sends the invitation email, with the link and the days it lasts', async () => {
    const { sendEmail, run } = setup('tok123')
    await run()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const mail = (sendEmail.mock.calls[0] as unknown as [Record<string, string>])[0]
    expect(mail.to).toBe('owner@example.com')
    expect(mail.subject).toContain('Set your Vardenia password')
    expect(mail.html).toContain('tok123')
    expect(mail.text).toContain(`works for ${PARTNER_INVITE_DAYS} days`)
  })

  it('does nothing when an account is updated rather than created', async () => {
    const { forgotPassword, sendEmail, run } = setup('tok123')
    await run('update')
    expect(forgotPassword).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('reports, and sends nothing, when no token comes back', async () => {
    const { sendEmail, run } = setup(null)
    await run()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalled()
  })

  it('reports a failed email instead of failing the create', async () => {
    const { run } = setup('tok123', true)
    await expect(run()).resolves.toEqual({ id: 7, email: 'owner@example.com' })
    expect(reportError).toHaveBeenCalled()
  })
})
