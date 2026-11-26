import { describe, expect, it, vi } from 'vitest'
import { postPlacePhoto, UPLOAD_URL } from './upload-client'

const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
const reply = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('postPlacePhoto', () => {
  it('posts multipart to /place-uploads with the token in the body, not the URL', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, logoReceived: true, heroReceived: false })),
    )
    const r = await postPlacePhoto('tok', 'logo', file, fetchImpl as never)
    expect(r).toEqual({ kind: 'ok', logoReceived: true, heroReceived: false })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(UPLOAD_URL)
    expect(url).not.toContain('tok')
    expect(url).not.toContain('?')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('sessionToken')).toBe('tok')
    expect(form.get('slot')).toBe('logo')
    expect((form.get('photo') as File).name).toBe('logo.png')
  })

  it.each([
    [404, 'dead'],
    [400, 'bad-file'],
    [413, 'bad-file'],
    [415, 'bad-file'],
    [429, 'rate-limited'],
    [500, 'failed'],
    [502, 'failed'],
  ])('status %i is %s', async (status, kind) => {
    expect(await postPlacePhoto('t', 'hero', file, reply(status))).toEqual({ kind })
  })

  it('a network error or an unreadable 200 is failed', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('offline')
    })
    expect(await postPlacePhoto('t', 'hero', file, down as never)).toEqual({ kind: 'failed' })
    const junk = vi.fn(async () => new Response('<html>', { status: 200 }))
    expect(await postPlacePhoto('t', 'hero', file, junk as never)).toEqual({ kind: 'failed' })
  })
})
