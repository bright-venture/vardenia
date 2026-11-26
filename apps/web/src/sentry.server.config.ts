import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './lib/sentry'

// Sentry on the Node server (route handlers, pages, Payload). Loaded by
// instrumentation.ts; settings and privacy rules in lib/sentry.
Sentry.init(sentryOptions())
