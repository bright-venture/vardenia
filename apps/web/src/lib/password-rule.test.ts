import { describe, expect, it, vi } from 'vitest'
import { passwordRuleOnReset } from './password-rule'

type Handler = (request: Request, context: unknown) => Promise<Response>
const passed: Handler = vi.fn(async () =>
  Response.json({ message: 'Password reset successfully.' }),
)

const post = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Payload's built-in reset accepted "abc" (20 November 2026). */
describe('the password rule on the built-in reset', () => {
  it.each(['/api/customers', '/api/business-users', '/api/users'])(
    'refuses a weak password at %s',
    async (base) => {
      const res = await passwordRuleOnReset(passed)(
        post(`${base}/reset-password`, { token: 't', password: 'abc' }),
        {},
      )
      expect(res.status).toBe(400)
      expect(JSON.stringify(await res.json())).toContain('at least 10 characters')
    },
  )

  it('refuses ten spaces', async () => {
    const res = await passwordRuleOnReset(passed)(
      post('/api/users/reset-password', { token: 't', password: '          ' }),
      {},
    )
    expect(res.status).toBe(400)
  })

  it('lets a good password through to Payload, body intact', async () => {
    const handler: Handler = vi.fn(async (request: Request) => Response.json(await request.json()))
    const res = await passwordRuleOnReset(handler)(
      post('/api/customers/reset-password', { token: 't', password: 'Faraya-2026' }),
      {},
    )
    expect(await res.json()).toEqual({ token: 't', password: 'Faraya-2026' })
  })

  it('does not touch any other request', async () => {
    const res = await passwordRuleOnReset(passed)(
      post('/api/customers/login', { email: 'a@b.co', password: 'abc' }),
      {},
    )
    expect(res.status).toBe(200)
  })
})
