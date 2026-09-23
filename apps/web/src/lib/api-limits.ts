/**
 * A ceiling on how much data one public API request may ask for.
 *
 * Payload's REST layer takes `limit` straight from the query string and has no
 * concept of a maximum. Verified against the real handler before this existed:
 *
 *     GET /api/businesses?limit=100000   ->  200, limit=100000
 *     GET /api/businesses?limit=0        ->  200, limit=0  (Payload: no limit)
 *
 * So an anonymous caller decided the page size, and `limit=0` meant "every
 * published row in one response". Against a connection pool of ten, on a link
 * to Frankfurt, a handful of concurrent requests like that is enough to starve
 * every other page - including `/g/`, the redirect printed in the magazine.
 * A denial of service that also takes down the paper product.
 *
 * The cap is applied unconditionally rather than only to anonymous callers.
 * Deciding "is this request authenticated" cheaply means trusting a token we
 * have not verified yet, and verifying it properly costs a database round trip
 * on every API call. A single ceiling avoids both, and nothing legitimate hits
 * it: the admin's list view offers at most 100 per page, the mobile client's
 * own schema caps `perPage` at 50, and every internal query in this codebase
 * uses the local API, which does not pass through here at all.
 */

/**
 * Chosen to sit above every real caller and well below anything expensive.
 * The admin's largest page size is 100; this leaves room for a screen we have
 * not built yet without leaving room for a scraper.
 */
export const MAX_API_LIMIT = 250

/**
 * Every key Payload's query parser would read as `name`.
 *
 * Payload parses the query string with `qs`, which turns `limit[0]=` and
 * `limit[]=` into a `limit` array - and a bracketed limit was read as no limit
 * at all. This guard used to look only at the plain key, so `?limit[0]=100000`
 * walked straight past it and returned every row. Measured on dev, September
 * 2026. Brackets are the only other spelling `qs` accepts here: dotted keys are
 * off by default, and a percent-encoded key is decoded before it reaches this.
 */
const keysFor = (params: URLSearchParams, name: string) =>
  [...new Set(params.keys())].filter((key) => key === name || key.startsWith(`${name}[`))

const withinCap = (value: string) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= MAX_API_LIMIT
}

/**
 * Bring the read parameters on a REST query to one clamped `limit`, in place.
 *
 * Returns whether anything changed, so the caller can avoid rebuilding a
 * request that was already fine.
 *
 * # One canonical `limit`, whatever was sent
 *
 * Rather than recognising each way of spelling "a lot" - which is how three
 * spellings got through - every key that would become `limit` or `pagination`
 * is removed, and a single plain `limit` is written back. What Payload sees is
 * then one number this function chose. It also ends a 500: `limit=10&limit=
 * 100000` reached Payload as an array, and Payload threw on it.
 *
 * # `pagination=false`
 *
 * Payload reads `pagination=false` as "no count query", and without a `limit`
 * it then returns every row: all 446 media rows on dev, all 1,277 listings in
 * production, past a cap that only ever looked at `limit`. lib/find-every
 * documents the same behaviour from the inside. So `pagination` is dropped -
 * paginating is Payload's default - and a caller that asked for everything
 * gets the largest page instead, with an honest `totalDocs` and `hasNextPage`
 * to continue from.
 *
 * # Anything unusable becomes the cap
 *
 * Not an error. A 400 would be a behaviour change for existing callers, and the
 * goal is bounding cost, not policing input. `limit=0` is the important case:
 * to Payload that means unlimited, so it is the largest request, not the
 * smallest. With several limits, any unusable one makes the whole request the
 * cap; otherwise the first wins.
 */
export function clampReadParams(params: URLSearchParams): boolean {
  const limitKeys = keysFor(params, 'limit')
  const paginationKeys = keysFor(params, 'pagination')

  // Nothing about page size was asked for: Payload applies its default of 10.
  if (limitKeys.length === 0 && paginationKeys.length === 0) return false

  const limits = limitKeys.flatMap((key) => params.getAll(key))

  // Already one plain, sane limit and no pagination flag: leave it exactly as sent.
  const [only] = limits
  if (
    paginationKeys.length === 0 &&
    limitKeys.length === 1 &&
    limitKeys[0] === 'limit' &&
    limits.length === 1 &&
    only !== undefined &&
    withinCap(only)
  ) {
    return false
  }

  const unpaginated = paginationKeys.some((key) => params.getAll(key).includes('false'))

  for (const key of [...limitKeys, ...paginationKeys]) params.delete(key)

  if (limits.length > 0) {
    const [first] = limits
    params.set(
      'limit',
      limits.every(withinCap) && first !== undefined ? first : String(MAX_API_LIMIT),
    )
  } else if (unpaginated) {
    params.set('limit', String(MAX_API_LIMIT))
  }

  return true
}

/**
 * Whether this POST is really a read.
 *
 * Payload accepts a GET sent as a POST with `X-Payload-HTTP-Method-Override:
 * GET` (or `X-HTTP-Method-Override`), taking a form-encoded body as the query
 * string - its own admin uses this for relationship fields, whose queries can
 * outgrow a URL. This guard wrapped GET only, on the reasoning that every other
 * verb is a write, so the same request as a POST skipped the cap entirely:
 * `limit=100000` in the body returned every row. Measured on dev, September
 * 2026.
 *
 * Deliberately a little broader than Payload's own check, which wants the
 * content type exactly: clamping a body Payload would then ignore costs
 * nothing, and a Payload upgrade that relaxed its check would otherwise reopen
 * this without a sound. A JSON body is left alone - `find` does not read its
 * parameters from one, which was measured too.
 */
function isOverrideRead(request: Request): boolean {
  if (request.method.toUpperCase() !== 'POST') return false

  const override =
    request.headers.get('X-Payload-HTTP-Method-Override') ??
    request.headers.get('X-HTTP-Method-Override')
  if (override?.toUpperCase() !== 'GET') return false

  const type = request.headers.get('Content-Type')?.toLowerCase() ?? ''
  return type.startsWith('application/x-www-form-urlencoded')
}

/**
 * Wrap a Payload REST handler so its read parameters are bounded.
 *
 * Wraps GET and POST. For a GET the query string is clamped. For a POST, only
 * a method-override read is touched - its body is the query, so it is read,
 * clamped and sent on; the URL's own query string is clamped as well, because
 * Payload appends the body to it rather than replacing it. Every other POST is
 * a genuine write and passes through without its body being read.
 */
type RestHandler = (request: Request, context: never) => Promise<Response>

export function withApiLimits(handler: RestHandler): RestHandler {
  return async (request, context) => {
    const url = new URL(request.url)

    if (isOverrideRead(request)) {
      const body = new URLSearchParams(await request.text())
      clampReadParams(body)
      clampReadParams(url.searchParams)

      // The body was consumed and may have changed length, so it is rebuilt
      // and the old Content-Length is dropped rather than left to disagree.
      const headers = new Headers(request.headers)
      headers.delete('content-length')

      return handler(new Request(url, { method: 'POST', headers, body: body.toString() }), context)
    }

    // A genuine write. Its body is a stream nothing here should read or rebuild,
    // and its cost is bounded by the document being written.
    if (request.method.toUpperCase() !== 'GET') return handler(request, context)

    if (!clampReadParams(url.searchParams)) return handler(request, context)

    // Rebuilt from the original so method, headers and credentials survive.
    return handler(new Request(url, request), context)
  }
}
