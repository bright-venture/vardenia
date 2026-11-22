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

  /** The admin's /admin/reset page sends a form with the fields in `_payload` (R9, 22 November 2026). */
  const adminForm = (password: string) => {
    const form = new FormData()
    form.set('_payload', JSON.stringify({ token: 't', password, 'confirm-password': password }))
    return new Request('http://localhost:3000/api/users/reset-password', {
      method: 'POST',
      body: form,
    })
  }

  it('refuses a weak password sent the way the admin reset page sends it', async () => {
    const res = await passwordRuleOnReset(passed)(adminForm('Short1!'), {})
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('at least 10 characters')
  })

  it('lets a good password from the admin reset page through, form intact', async () => {
    const handler: Handler = vi.fn(async (request: Request) =>
      Response.json(JSON.parse(String((await request.formData()).get('_payload')))),
    )
    const res = await passwordRuleOnReset(handler)(adminForm('Faraya-2026'), {})
    expect((await res.json()).password).toBe('Faraya-2026')
  })

  it('refuses a weak password in a plain form field', async () => {
    const res = await passwordRuleOnReset(passed)(
      new Request('http://localhost:3000/api/business-users/reset-password', {
        method: 'POST',
        body: new URLSearchParams({ token: 't', password: 'abc' }),
      }),
      {},
    )
    expect(res.status).toBe(400)
  })

  it('does not touch any other request', async () => {
    const res = await passwordRuleOnReset(passed)(
      post('/api/customers/login', { email: 'a@b.co', password: 'abc' }),
      {},
    )
    expect(res.status).toBe(200)
  })
})
