import { describe, expect, it, vi } from 'vitest'

vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))

const { sameAnswerForForgotPassword } = await import('./forgot-password')
const { reportError } = await import('./report')

const post = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

type Handler = (request: Request, context: unknown) => Promise<Response>

const answering = (status: number, body: unknown): Handler =>
  vi.fn(async () => Response.json(body, { status }))

describe('forgot password gives the same answer for every address', () => {
  it('turns a failed email into the usual success reply, and reports it', async () => {
    const handler = answering(422, {
      errors: [{ message: 'Error sending email: 422 validation_error' }],
    })
    const res = await sameAnswerForForgotPassword(handler)(
      post('/api/customers/forgot-password', { email: 'known@example.com' }),
      {},
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Success' })
    expect(reportError).toHaveBeenCalled()
    const report = JSON.stringify(vi.mocked(reportError).mock.calls.at(-1))
    expect(report).not.toContain('known@example.com')
  })

  it('matches the reply for an unknown address', async () => {
    const unknown = await sameAnswerForForgotPassword(answering(200, { message: 'Success' }))(
      post('/api/business-users/forgot-password', { email: 'nobody@example.com' }),
      {},
    )
    const failed = await sameAnswerForForgotPassword(answering(500, { errors: [] }))(
      post('/api/business-users/forgot-password', { email: 'known@example.com' }),
      {},
    )
    expect([failed.status, await failed.json()]).toEqual([unknown.status, await unknown.json()])
  })

  it('still tells the person when no usable address was typed', async () => {
    const res = await sameAnswerForForgotPassword(
      answering(400, { errors: [{ message: 'Missing email' }] }),
    )(post('/api/users/forgot-password', { email: '' }), {})
    expect(res.status).toBe(400)
  })

  it('leaves the rate limit answer alone', async () => {
    const res = await sameAnswerForForgotPassword(answering(429, { errors: [] }))(
      post('/api/users/forgot-password', { email: 'a@b.co' }),
      {},
    )
    expect(res.status).toBe(429)
  })

  it('does not touch any other request', async () => {
    const res = await sameAnswerForForgotPassword(answering(401, { errors: [] }))(
      post('/api/customers/login', { email: 'a@b.co', password: 'x' }),
      {},
    )
    expect(res.status).toBe(401)
  })

  it('passes the body through to Payload untouched', async () => {
    const handler: Handler = vi.fn(async (request: Request) => Response.json(await request.json()))
    const res = await sameAnswerForForgotPassword(handler)(
      post('/api/customers/forgot-password', { email: 'a@b.co' }),
      {},
    )
    expect(await res.json()).toEqual({ email: 'a@b.co' })
  })
})
