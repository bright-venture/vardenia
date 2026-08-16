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
import { withRateLimit } from '../../../../lib/rate-limit'

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
const guardWrite = <T>(handler: T) => withRateLimit(handler as never) as T

export const GET = guardRead(REST_GET(config))
export const POST = guardWrite(REST_POST(config))
export const DELETE = guardWrite(REST_DELETE(config))
export const PATCH = guardWrite(REST_PATCH(config))
export const PUT = guardWrite(REST_PUT(config))
export const OPTIONS = REST_OPTIONS(config)
