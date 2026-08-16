import { clientIp } from './scan-guard'

/**
 * A ceiling on how *often* one caller may hit the API.
 *
 * The companion to api-limits.ts. That bounds the cost of a single request;
 * this bounds how many of them arrive. Neither is sufficient alone: capped
 * requests issued in a tight loop still exhaust a ten-connection pool, and a
 * generous rate on unbounded requests is no protection at all.
 *
 * Deliberately NOT in middleware. Next runs middleware on the Edge runtime,
 * where module state lives in a short-lived isolate that may be recreated
 * between requests - a counter there would reset constantly and count almost
 * nothing. A route wrapper runs in the Node server, where module state persists
 * for the life of the process, which is what makes counting possible at all.
 *
 * Same caveat as scan-guard, and for the same reason: this state is per
 * process. On one long-lived server it is accurate. Across several instances
 * each keeps its own tally, so the effective limit multiplies by the instance
 * count. That is a weaker guarantee, not a broken one - the point is bounding
 * a scraper, and a limit that is three times too generous still does that.
 * Moving both this and the scan guard to a shared store is one job, best done
 * when the deployment shape is known.
 */

/** Fixed window. Simple to reason about and cheap to keep. */
const WINDOW_MS = 60_000

/**
 * Requests per window, per address.
 *
 * Chosen to sit far above a person and far below a script. The admin panel is
 * chatty - a list view with relationship fields can fire a dozen requests - and
 * a whole office shares one address behind NAT, so the budget has to absorb
 * several staff working at once. Five requests a second sustained is not a
 * person; it is something automated.
 *
 * If this ever fires for real staff, raise it. A false positive here blocks
 * someone from doing their job, which is worse than a scraper getting a
 * slightly better rate.
 */
const MAX_PER_WINDOW = 300

/** Stop the map growing without bound on a long-lived server. */
const SWEEP_INTERVAL_MS = 5 * 60_000

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()
let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now

  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export interface RateVerdict {
  allowed: boolean
  limit: number
  remaining: number
  /** Seconds until the window resets. Sent as Retry-After when blocked. */
  retryAfter: number
}

/**
 * Count one request against an address and say whether it may proceed.
 *
 * A caller we cannot identify - no proxy headers at all - is allowed through
 * rather than lumped into a single shared bucket. Sharing one counter across
 * every unidentifiable caller would let one script deny service to all of them,
 * which turns a mitigation into a vulnerability.
 */
export function checkRate(headers: Headers, now = Date.now()): RateVerdict {
  sweep(now)

  const ip = clientIp(headers)
  const unlimited: RateVerdict = {
    allowed: true,
    limit: MAX_PER_WINDOW,
    remaining: MAX_PER_WINDOW,
    retryAfter: 0,
  }
  if (!ip) return unlimited

  const existing = windows.get(ip)

  if (!existing || existing.resetAt <= now) {
    windows.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { ...unlimited, remaining: MAX_PER_WINDOW - 1 }
  }

  existing.count += 1

  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  const remaining = Math.max(0, MAX_PER_WINDOW - existing.count)

  return {
    allowed: existing.count <= MAX_PER_WINDOW,
    limit: MAX_PER_WINDOW,
    remaining,
    retryAfter,
  }
}

/** Standard headers, so a well-behaved client can back off before being blocked. */
export function rateHeaders(verdict: RateVerdict): Record<string, string> {
  return {
    'x-ratelimit-limit': String(verdict.limit),
    'x-ratelimit-remaining': String(verdict.remaining),
  }
}

export function tooManyRequests(verdict: RateVerdict): Response {
  return new Response('Too many requests. Slow down and try again shortly.', {
    status: 429,
    headers: {
      ...rateHeaders(verdict),
      'retry-after': String(verdict.retryAfter),
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

type Handler = (request: Request, context: never) => Promise<Response>

/**
 * Wrap a handler so repeated calls from one address are bounded.
 *
 * Never apply this to `/g/`. A printed code has to resolve for everyone, every
 * time, for as long as the paper is in circulation - a coach party of forty
 * scanning the same table tent from one hotel's Wi-Fi is a success, not an
 * attack. That route has its own protection in scan-guard, which limits what
 * gets *counted* and never what works.
 */
export function withRateLimit(handler: Handler): Handler {
  return async (request, context) => {
    const verdict = checkRate(request.headers)
    if (!verdict.allowed) return tooManyRequests(verdict)

    const response = await handler(request, context)

    for (const [key, value] of Object.entries(rateHeaders(verdict))) {
      response.headers.set(key, value)
    }

    return response
  }
}

/** Test seam. The map is module state, which a test must be able to reset. */
export function __resetRateLimit() {
  windows.clear()
  lastSweep = 0
}

export const RATE_LIMIT = { WINDOW_MS, MAX_PER_WINDOW } as const
