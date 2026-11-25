import { describe, expect, it, vi } from 'vitest'
import {
  fetchTerms,
  FINISH_URL,
  postFinish,
  postStatus,
  STATUS_URL,
  TERMS_URL,
} from './flow-client'

const reply = (status: number, body: unknown) =>
  vi.fn(
    async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  )

describe('fetchTerms', () => {
  const TERMS = {
    price: 1000,
    currency: 'USD',
    termMonths: 12,
    termsVersion: '2026-11-24',
    downpaymentPercent: 50,
    downpaymentAmount: 500,
    downpaymentDeadlineDays: 7,
    balanceDeadlineDays: 30,
  }

  it('reads the price, term, version, downpayment and both deadlines from the route', async () => {
    const f = reply(200, { ok: true, ...TERMS, extra: 'ignored' })
    expect(await fetchTerms(f)).toEqual(TERMS)
    expect(f).toHaveBeenCalledWith(TERMS_URL, expect.objectContaining({ cache: 'no-store' }))
  })

  it('is null when the payment terms are missing (an older server)', async () => {
    const old: Partial<typeof TERMS> = { ...TERMS }
    delete old.downpaymentAmount
    expect(await fetchTerms(reply(200, { ok: true, ...old }))).toBeNull()
  })

  it('is null on an error, a bad body or a network failure', async () => {
    expect(await fetchTerms(reply(500, { ok: false }))).toBeNull()
    expect(await fetchTerms(reply(200, { ok: true, price: 'x' }))).toBeNull()
    expect(
      await fetchTerms(
        vi.fn(async () => {
          throw new TypeError('offline')
        }),
      ),
    ).toBeNull()
  })
})

describe('postStatus', () => {
  it('posts the token in the JSON body, not the URL', async () => {
    const f = reply(200, { ok: true, logoReceived: true, heroReceived: false, live: true })
    expect(await postStatus('tok', f)).toEqual({
      kind: 'ok',
      logoReceived: true,
      heroReceived: false,
      live: true,
    })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(STATUS_URL)
    expect(url).not.toContain('tok')
    expect(JSON.parse(init.body as string)).toEqual({ sessionToken: 'tok' })
  })

  it('maps 404 to gone, live:false through, and other failures to error', async () => {
    expect(await postStatus('t', reply(404, { ok: false }))).toEqual({ kind: 'gone' })
    expect(
      (
        await postStatus(
          't',
          reply(200, { ok: true, logoReceived: true, heroReceived: true, live: false }),
        )
      ).kind,
    ).toBe('ok')
    expect(await postStatus('t', reply(429, 'slow'))).toEqual({ kind: 'error' })
    expect(await postStatus('t', reply(500, 'x'))).toEqual({ kind: 'error' })
    expect(await postStatus('t', reply(200, 'not json'))).toEqual({ kind: 'error' })
    expect(
      await postStatus(
        't',
        vi.fn(async () => {
          throw new TypeError('offline')
        }),
      ),
    ).toEqual({ kind: 'error' })
  })
})

describe('postFinish', () => {
  const parts = { token: 'tok', turnstileToken: 'ts', locale: 'ar' }

  it('posts token, acceptance, turnstile token and locale as JSON', async () => {
    const f = reply(200, { ok: true, reference: 'VD-12' })
    expect(await postFinish(parts, f)).toEqual({ kind: 'ok', reference: 'VD-12' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(FINISH_URL)
    expect(JSON.parse(init.body as string)).toEqual({
      sessionToken: 'tok',
      acceptedTerms: true,
      turnstileToken: 'ts',
      locale: 'ar',
    })
  })

  const cases: Array<[number, unknown, string]> = [
    [404, { ok: false, code: 'not-found' }, 'gone'],
    [403, { ok: false }, 'turnstile'],
    [429, 'Too many', 'rate-limited'],
    [422, { ok: false, code: 'terms-not-accepted' }, 'terms-not-accepted'],
    [422, { ok: false, code: 'photos-missing' }, 'photos-missing'],
    [500, { ok: false, code: 'error' }, 'failed'],
  ]
  for (const [status, body, kind] of cases) {
    it(`maps ${status} ${JSON.stringify(body)} to ${kind}`, async () => {
      expect((await postFinish(parts, reply(status, body))).kind).toBe(kind)
    })
  }

  it('maps a thrown fetch to network, and an ok without a reference to failed', async () => {
    expect(
      (
        await postFinish(
          parts,
          vi.fn(async () => {
            throw new TypeError('x')
          }),
        )
      ).kind,
    ).toBe('network')
    expect((await postFinish(parts, reply(200, { ok: true }))).kind).toBe('failed')
  })
})
