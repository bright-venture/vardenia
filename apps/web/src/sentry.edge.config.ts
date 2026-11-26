import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './lib/sentry'

// Sentry in the edge runtime (proxy.ts). Loaded by instrumentation.ts; settings
// and privacy rules in lib/sentry.
Sentry.init(sentryOptions())
