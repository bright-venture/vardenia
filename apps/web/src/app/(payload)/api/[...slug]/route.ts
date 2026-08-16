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

/**
 * The one hand-made change to this generated file: GET is wrapped so a caller
 * cannot choose an unbounded page size. See lib/api-limits.ts for why.
 */
export const GET = withApiLimits(REST_GET(config) as never) as never
export const POST = REST_POST(config)
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)
export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
