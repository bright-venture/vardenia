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

/**
 * The spellings that got past the cap, each measured on dev in September 2026
 * against a public collection of 446 rows. Every one of them returned all 446.
 */
describe('clampReadParams, the ways round it', () => {
  /** Every key the result would hand Payload as a page-size instruction. */
  const sizeKeys = (params: URLSearchParams) =>
    [...params.keys()].filter((key) => key.startsWith('limit') || key.startsWith('pagination'))

  it.each(['limit[0]=100000', 'limit[]=100000', 'limit[a]=100000'])(
    'caps the bracketed %s, which qs reads as a limit',
    (qs) => {
      const params = new URLSearchParams(qs)
      expect(clampReadParams(params)).toBe(true)
      expect(sizeKeys(params)).toEqual(['limit'])
      expect(params.get('limit')).toBe(String(MAX_API_LIMIT))
    },
  )

  /**
   * Payload threw on this one rather than leaking - it arrived as an array -
   * but a 500 from a query string is its own problem. It now reaches Payload
   * as one number.
   */
  it('reduces repeated limits to one, capped if any of them is too large', () => {
    const params = new URLSearchParams('limit=10&limit=100000')
    clampReadParams(params)
    expect(params.getAll('limit')).toEqual([String(MAX_API_LIMIT)])
  })

  it('keeps the first of several sane limits, once', () => {
    const params = new URLSearchParams('limit=10&limit[0]=20')
    clampReadParams(params)
    expect(sizeKeys(params)).toEqual(['limit'])
    expect(params.get('limit')).toBe('10')
  })

  /**
   * `pagination=false` with no limit is every row: Payload applies no limit
   * and skips the count. It becomes the largest page, paginated, so the
   * caller is told how many there are and how to get the rest.
   */
  it('turns pagination=false into the largest page, paginated', () => {
    const params = new URLSearchParams('pagination=false')
    expect(clampReadParams(params)).toBe(true)
    expect(sizeKeys(params)).toEqual(['limit'])
    expect(params.get('limit')).toBe(String(MAX_API_LIMIT))
  })

  it('keeps a small limit that came with pagination=false', () => {
    const params = new URLSearchParams('pagination=false&limit=5')
    clampReadParams(params)
    expect(sizeKeys(params)).toEqual(['limit'])
    expect(params.get('limit')).toBe('5')
  })

  it('drops a bracketed pagination too', () => {
    const params = new URLSearchParams('pagination[0]=false')
    clampReadParams(params)
    expect(sizeKeys(params)).toEqual(['limit'])
    expect(params.get('limit')).toBe(String(MAX_API_LIMIT))
  })

  /** Paginating is the default, so saying so changes nothing about the size. */
  it('drops pagination=true without inventing a limit', () => {
    const params = new URLSearchParams('pagination=true')
    clampReadParams(params)
    expect(sizeKeys(params)).toEqual([])
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

/**
 * A POST with a method-override header is a GET to Payload, with the query in
 * a form-encoded body. The cap wrapped GET only, so `limit=100000` in that body
 * returned every row. Payload's own admin sends reads this way, which is why
 * they have to keep working rather than be refused.
 */
describe('withApiLimits, reads sent as POST', () => {
  /** Echoes what the handler received, so the tests can see what Payload would. */
  const seenBy = async (request: Request) => {
    const wrapped = withApiLimits((async (received: Request) =>
      Response.json({
        method: received.method,
        url: received.url,
        body: await received.text(),
        auth: received.headers.get('authorization'),
      })) as never)
    return (await wrapped(request, undefined as never)).json() as Promise<{
      method: string
      url: string
      body: string
      auth: string | null
    }>
  }

  const overrideRead = (body: string, header = 'X-Payload-HTTP-Method-Override', url = '') =>
    new Request(`http://x/api/media${url}`, {
      method: 'POST',
      headers: {
        [header]: 'GET',
        'Content-Type': 'application/x-www-form-urlencoded',
        authorization: 'JWT abc',
      },
      body,
    })

  it('caps the limit in the body', async () => {
    const seen = await seenBy(overrideRead('limit=100000&depth=0'))
    const body = new URLSearchParams(seen.body)

    expect(body.get('limit')).toBe(String(MAX_API_LIMIT))
    expect(body.get('depth')).toBe('0')
    expect(seen.method).toBe('POST')
    expect(seen.auth).toBe('JWT abc')
  })

  it('caps pagination=false in the body', async () => {
    const body = new URLSearchParams((await seenBy(overrideRead('pagination=false'))).body)

    expect(body.get('pagination')).toBeNull()
    expect(body.get('limit')).toBe(String(MAX_API_LIMIT))
  })

  it('honours the other override header Payload accepts', async () => {
    const body = new URLSearchParams(
      (await seenBy(overrideRead('limit=0', 'X-HTTP-Method-Override'))).body,
    )
    expect(body.get('limit')).toBe(String(MAX_API_LIMIT))
  })

  /** Payload appends the body to the URL's query rather than replacing it. */
  it('caps the URL query string on an override read as well', async () => {
    const seen = await seenBy(overrideRead('depth=0', undefined, '?limit=100000'))
    expect(new URL(seen.url).searchParams.get('limit')).toBe(String(MAX_API_LIMIT))
  })

  it('passes a genuine write through with its body unread and unchanged', async () => {
    const payload = JSON.stringify({ name: 'A listing', limit: 100000 })
    const seen = await seenBy(
      new Request('http://x/api/businesses?limit=100000', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }),
    )

    expect(seen.body).toBe(payload)
    expect(new URL(seen.url).searchParams.get('limit')).toBe('100000')
  })

  /** `find` ignores parameters in a JSON body - measured - so there is nothing to cap. */
  it('leaves an override with a JSON body alone', async () => {
    const payload = JSON.stringify({ limit: 100000 })
    const seen = await seenBy(
      new Request('http://x/api/media', {
        method: 'POST',
        headers: { 'X-Payload-HTTP-Method-Override': 'GET', 'Content-Type': 'application/json' },
        body: payload,
      }),
    )
    expect(seen.body).toBe(payload)
  })
})
