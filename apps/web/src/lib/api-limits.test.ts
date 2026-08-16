import { describe, expect, it } from 'vitest'
import { MAX_API_LIMIT, clampReadParams, withApiLimits } from './api-limits'

/**
 * Payload's REST layer takes `limit` from the query string with no maximum, so
 * an anonymous caller chose the page size. `?limit=0` meant every row in one
 * response. Against a ten-connection pool that is a denial of service which
 * also takes down the printed QR redirect.
 */

const clamp = (qs: string) => {
  const params = new URLSearchParams(qs)
  const changed = clampReadParams(params)
  return { limit: params.get('limit'), changed }
}

describe('clampReadParams', () => {
  it('leaves a request with no limit alone, so Payload applies its own default', () => {
    expect(clamp('')).toEqual({ limit: null, changed: false })
  })

  it('leaves an ordinary page size untouched', () => {
    expect(clamp('limit=10')).toEqual({ limit: '10', changed: false })
    expect(clamp('limit=100')).toEqual({ limit: '100', changed: false })
  })

  it('allows exactly the cap', () => {
    expect(clamp(`limit=${MAX_API_LIMIT}`)).toEqual({
      limit: String(MAX_API_LIMIT),
      changed: false,
    })
  })

  it('caps a page size above the ceiling', () => {
    expect(clamp('limit=251').limit).toBe(String(MAX_API_LIMIT))
    expect(clamp('limit=100000').limit).toBe(String(MAX_API_LIMIT))
  })

  /**
   * The one that matters most. To Payload, `limit=0` means no limit at all, so
   * the smallest-looking value was the most expensive request possible.
   */
  it('treats limit=0 as the largest request, not the smallest', () => {
    expect(clamp('limit=0').limit).toBe(String(MAX_API_LIMIT))
  })

  it.each(['-1', 'abc', '', 'Infinity', '1e9', 'null'])('caps the nonsense value %o', (value) => {
    expect(clamp(`limit=${value}`).limit).toBe(String(MAX_API_LIMIT))
  })

  it('leaves every other parameter alone', () => {
    const params = new URLSearchParams('limit=100000&where[slug][equals]=x&depth=1&sort=-createdAt')
    clampReadParams(params)

    expect(params.get('limit')).toBe(String(MAX_API_LIMIT))
    expect(params.get('where[slug][equals]')).toBe('x')
    expect(params.get('depth')).toBe('1')
    expect(params.get('sort')).toBe('-createdAt')
  })
})

describe('withApiLimits', () => {
  const echo = async (request: Request) => new Response(request.url)

  it('rewrites an oversized request before the handler sees it', async () => {
    const wrapped = withApiLimits(echo as never)
    const res = await wrapped(
      new Request('http://x/api/businesses?limit=100000'),
      undefined as never,
    )

    expect(await res.text()).toContain(`limit=${MAX_API_LIMIT}`)
    expect(
      await (
        await wrapped(new Request('http://x/api/businesses?limit=0'), undefined as never)
      ).text(),
    ).toContain(`limit=${MAX_API_LIMIT}`)
  })

  it('passes an acceptable request through untouched', async () => {
    const wrapped = withApiLimits(echo as never)
    const res = await wrapped(new Request('http://x/api/businesses?limit=25'), undefined as never)

    expect(await res.text()).toContain('limit=25')
  })

  it('preserves the rest of the query string when it rewrites', async () => {
    const wrapped = withApiLimits(echo as never)
    const res = await wrapped(
      new Request('http://x/api/businesses?limit=99999&sort=name&depth=2'),
      undefined as never,
    )
    const url = await res.text()

    expect(url).toContain('sort=name')
    expect(url).toContain('depth=2')
  })

  it('keeps the authorization header, so a staff request is still a staff request', async () => {
    const seen: string[] = []
    const capture = async (request: Request) => {
      seen.push(request.headers.get('authorization') ?? '')
      return new Response('ok')
    }

    const wrapped = withApiLimits(capture as never)
    await wrapped(
      new Request('http://x/api/businesses?limit=100000', {
        headers: { authorization: 'JWT abc' },
      }),
      undefined as never,
    )

    expect(seen[0]).toBe('JWT abc')
  })
})
