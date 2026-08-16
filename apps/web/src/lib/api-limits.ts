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
 * Clamp the read parameters on a REST query string, in place.
 *
 * Returns whether anything changed, so the caller can avoid rebuilding a
 * request that was already fine.
 */
export function clampReadParams(params: URLSearchParams): boolean {
  const raw = params.get('limit')

  // Absent is fine: Payload applies its own default of 10.
  if (raw === null) return false

  const value = Number(raw)

  /**
   * Anything that is not a sane positive integer becomes the cap rather than an
   * error. A 400 here would be a behaviour change for existing callers, and the
   * goal is bounding cost, not policing input.
   *
   * `limit=0` is the important case: to Payload that means unlimited, so it has
   * to be treated as the largest possible request rather than the smallest.
   */
  if (!Number.isFinite(value) || value <= 0 || value > MAX_API_LIMIT) {
    params.set('limit', String(MAX_API_LIMIT))
    return true
  }

  return false
}

/**
 * Wrap a Payload REST handler so its read parameters are bounded.
 *
 * Applied to GET only. The other verbs are writes, and every collection here
 * refuses them without a staff session - so the exposure this exists to close
 * is not reachable through them.
 */
type RestHandler = (request: Request, context: never) => Promise<Response>

export function withApiLimits(handler: RestHandler): RestHandler {
  return async (request, context) => {
    const url = new URL(request.url)

    if (!clampReadParams(url.searchParams)) return handler(request, context)

    // Rebuilt from the original so method, headers and credentials survive.
    return handler(new Request(url, request), context)
  }
}
