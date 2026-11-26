import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))

const { GuestQuestions } = await import('./GuestQuestions')
const { reportError } = await import('../lib/report')

const sendAnswer = GuestQuestions.hooks!.beforeChange![0]!

const originalDoc = {
  id: 12,
  name: 'Rana',
  email: 'rana@example.com',
  question: 'Is parking free?',
  status: 'new',
}

const answer = (sendFails = false) => {
  const sendEmail = vi.fn(async () => {
    if (sendFails) throw new Error('provider down')
  })
  const data: Record<string, unknown> = { status: 'answered', answer: 'Yes, it is.' }
  const result = sendAnswer({
    data,
    originalDoc,
    operation: 'update',
    req: { payload: { sendEmail } },
  } as never) as Promise<Record<string, unknown>>
  return { sendEmail, result }
}

beforeEach(() => vi.mocked(reportError).mockClear())

describe('the answer email to a guest question', () => {
  it('sends the answer and stamps the time', async () => {
    const { sendEmail, result } = answer()
    const data = await result
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(data.answeredAt).toBeTypeOf('string')
    expect(reportError).not.toHaveBeenCalled()
  })

  it('reports a failed send and leaves it unstamped, so saving again retries', async () => {
    const { result } = answer(true)
    const data = await result
    expect(data.answeredAt).toBeUndefined()
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        source: 'guest-question.answer-email',
        extra: { question: 12 },
      }),
    )
  })
})
