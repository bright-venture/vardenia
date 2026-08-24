/* Payload REST API. Generated structure - avoid editing by hand. */
import config from '@payload-config'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'
import { withApiLimits } from '../../../../lib/api-limits'
import { RATE_LIMIT, withRateLimit } from '../../../../lib/rate-limit'

/**
 * The hand-made changes to this generated file, both about bounding what one
 * caller can demand:
 *
 *  - `withApiLimits` caps the page size of a single read (lib/api-limits.ts)
 *  - `withRateLimit` caps how many requests arrive (lib/rate-limit.ts)
 *
 * Reads get both. Writes get the rate limit only - their cost is bounded by the
 * document being written, and every collection here already refuses them
 * without a staff session, but a login endpoint that answers forever is how
 * passwords get guessed.
 */
const guardRead = <T>(handler: T) => withRateLimit(withApiLimits(handler as never)) as T

/**
 * Payload's own auth endpoints, which cost something to be wrong about.
 *
 * `forgot-password` sends a real email on every call, so at the general budget
 * of 300 a minute one address could aim 300 emails a minute at one mailbox -
 * flooding the recipient and burning the sending reputation of the domain in
 * the same request loop. `login` and `unlock` are the guessing surface, and
 * `reset-password` and `verify` both consume a token that was mailed out.
 *
 * These are substrings of the path rather than exact routes because every
 * auth collection exposes its own copy: /api/customers/login,
 * /api/business-users/login and /api/users/login are three different paths and
 * the same endpoint.
 */
const AUTH_PATHS = [
  '/login',
  '/logout',
  '/forgot-password',
  '/reset-password',
  '/refresh-token',
  '/unlock',
  '/verify/',
]

const isAuthPath = (url: string) => {
  try {
    const path = new URL(url).pathname
    return AUTH_PATHS.some((segment) => path.includes(segment))
  } catch {
    // An unparseable URL is not a reason to hand out the larger budget.
    return true
  }
}

/**
 * Writes get the tight budget when they touch auth, the general one otherwise.
 *
 * Chosen per request rather than per export, because one handler serves both.
 * The two budgets are counted in separate buckets (see lib/rate-limit), so a
 * staff member using the admin panel cannot spend the auth allowance and then
 * find themselves unable to sign in.
 */
const guardWrite = <T>(handler: T) => {
  const general = withRateLimit(handler as never)
  const auth = withRateLimit(handler as never, RATE_LIMIT.AUTH_PER_WINDOW)

  return (async (request: Request, context: unknown) =>
    isAuthPath(request.url)
      ? auth(request as never, context as never)
      : general(request as never, context as never)) as T
}

export const GET = guardRead(REST_GET(config))
export const POST = guardWrite(REST_POST(config))
export const DELETE = guardWrite(REST_DELETE(config))
export const PATCH = guardWrite(REST_PATCH(config))
export const PUT = guardWrite(REST_PUT(config))
export const OPTIONS = REST_OPTIONS(config)
