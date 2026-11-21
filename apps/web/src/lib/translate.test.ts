import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * The translation seam's own bounds (Task 3 review): a per-request timeout,
 * an overall deadline handed in by the caller, and a cap per text node.
 */

let mod: typeof import('./translate')

beforeAll(async () => {
  vi.stubEnv('LIBRETRANSLATE_URL', 'http://engine.test')
  vi.resetModules()
  mod = await import('./translate')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ok = (text: string) =>
  vi.fn(async () => new Response(JSON.stringify({ translatedText: text }), { status: 200 }))

describe('translateText', () => {
  it('sends a request with a timeout signal', async () => {
    const fetch = ok('bonjour')
    vi.stubGlobal('fetch', fetch)
    await expect(mod.translateText('hello', 'en', 'fr')).resolves.toBe('bonjour')
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('does not send a text node over the cap', async () => {
    const fetch = ok('x')
    vi.stubGlobal('fetch', fetch)
    const long = 'a'.repeat(mod.MAX_TEXT_CHARS + 1)
    await expect(mod.translateText(long, 'en', 'fr')).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses to start once the deadline has passed', async () => {
    const fetch = ok('x')
    vi.stubGlobal('fetch', fetch)
    await expect(
      mod.translateText('hello', 'en', 'fr', { deadline: Date.now() - 1 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws a TranslateHttpError on an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 400 })),
    )
    await expect(mod.translateText('hello', 'en', 'xx')).rejects.toBeInstanceOf(
      mod.TranslateHttpError,
    )
  })
})

describe('translateRichText', () => {
  it('stops between nodes at the deadline', async () => {
    let now = 5_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const fetch = vi.fn(async () => {
      now += 1_000
      return new Response(JSON.stringify({ translatedText: 't' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetch)
    const value = {
      root: {
        type: 'root',
        children: Array.from({ length: 10 }, () => ({ type: 'text', text: 'hi' })),
      },
    }
    await expect(
      mod.translateRichText(value, 'en', 'fr', { deadline: 5_000 + 3_500 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('keeps an over-long node as it was and translates the rest', async () => {
    vi.stubGlobal('fetch', ok('t'))
    const value = {
      root: {
        type: 'root',
        children: [
          { type: 'text', text: 'a'.repeat(mod.MAX_TEXT_CHARS + 1) },
          { type: 'text', text: 'hi' },
        ],
      },
    }
    const out = (await mod.translateRichText(value, 'en', 'fr')) as typeof value
    expect(out.root.children[0]!.text.length).toBe(mod.MAX_TEXT_CHARS + 1)
    expect(out.root.children[1]!.text).toBe('t')
  })
})
