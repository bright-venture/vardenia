import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './lib/sentry'

/**
 * Sentry in the reader's browser (25 November 2026): a script error, a failed
 * promise, or a page that throws while rendering on the client. Until now these
 * were never seen; lib/report covers the server only.
 *
 * Settings and privacy rules in lib/sentry. Nothing is sent without a DSN or
 * from a local development server.
 */
Sentry.init(sentryOptions())

// Navigation timing for Sentry's tracing. Tracing is off (lib/sentry), so this
// records nothing today; it is exported because the SDK expects it here.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
