/* Payload GraphQL endpoint. Generated structure - avoid editing by hand. */
import config from '@payload-config'
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes'
import { withRateLimit } from '../../../../lib/rate-limit'

/**
 * The one hand-made change to this generated file.
 *
 * GraphQL takes the same rate limit as REST, and needs it more: a single POST
 * can ask for far more than a single GET, so a lower request count buys an
 * attacker the same amount of work. `graphQL.maxComplexity` in payload.config
 * bounds each query; this bounds how many arrive.
 */
export const POST = withRateLimit(GRAPHQL_POST(config) as never) as never
export const OPTIONS = REST_OPTIONS(config)
