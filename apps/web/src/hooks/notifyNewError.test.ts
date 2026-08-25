import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyNewError } from './notifyNewError'

/**
 * An alert that fires on every occurrence is an alert nobody reads, and an
 * alert that can fail a write is worse than no alert at all. Those are the two
 * things asserted here.
 */

type Sent = { to: string; subject: string; text: string }

const run = async (
  doc: Record<string, unknown>,
  operation: 'create' | 'update',
  sendEmail: (args: Sent) => Promise<unknown> = async () => undefined,
) => {
  const sent: Sent[] = []
  const spy = async (args: Sent) => {
    sent.push(args)
    return sendEmail(args)
  }

  // Only the two properties the hook touches. The rest of Payload's hook
  // argument is irrelevant here and faking it fully would test the fake.
  const result = await (notifyNewError as unknown as (args: unknown) => Promise<unknown>)({
    doc,
    operation,
    req: { payload: { sendEmail: spy } },
  })

  return { sent, result }
}

const ERROR_DOC = {
  id: 42,
  level: 'error',
  source: 'booking.confirmation-email',
  message: 'Failed to send',
  path: '/booking/request',
  firstSeen: '2026-08-25T10:00:00.000Z',
}

beforeEach(() => {
  vi.stubEnv('ERROR_ALERT_TO', 'ops@vardenia.com')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://vardenia.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('notifyNewError', () => {
  it('mails on a first sighting', async () => {
    const { sent } = await run(ERROR_DOC, 'create')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe('ops@vardenia.com')
  })

  /**
   * The whole point. `reportError` updates rather than creates when the
   * fingerprint already exists, so a crash loop is one create followed by
   * thousands of updates - and only the create may mail.
   */
  it('says nothing about a repeat', async () => {
    const { sent } = await run({ ...ERROR_DOC, count: 4831 }, 'update')
    expect(sent).toHaveLength(0)
  })

  it('is off when no recipient is configured', async () => {
    vi.stubEnv('ERROR_ALERT_TO', '')
    const { sent } = await run(ERROR_DOC, 'create')
    expect(sent).toHaveLength(0)
  })

  it('names the source in the subject, so it can be read on a phone', async () => {
    const { sent } = await run(ERROR_DOC, 'create')
    expect(sent[0]!.subject).toContain('booking.confirmation-email')
    expect(sent[0]!.subject).toContain('error')
  })

  it('links straight to the record', async () => {
    const { sent } = await run(ERROR_DOC, 'create')
    expect(sent[0]!.text).toContain('https://vardenia.com/admin/collections/error-events/42')
  })

  it('still sends when there is no site URL to link to', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const { sent } = await run(ERROR_DOC, 'create')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.text).toContain('Error Events')
  })

  /**
   * An afterChange that throws fails the write, which would lose the record of
   * what broke in order to complain that it could not tell anyone about it.
   */
  it('swallows a failure to send rather than failing the write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      run(ERROR_DOC, 'create', async () => {
        throw new Error('SMTP is down')
      }),
    ).resolves.toBeDefined()
  })

  it('returns the document unchanged', async () => {
    const { result } = await run(ERROR_DOC, 'create')
    expect(result).toBe(ERROR_DOC)
  })

  it('copes with a document missing its optional fields', async () => {
    const { sent } = await run({ id: 7, message: 'Something' }, 'create')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.subject).toContain('unknown')
  })
})
