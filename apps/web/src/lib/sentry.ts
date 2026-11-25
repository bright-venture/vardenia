import { redact } from './redact'

/**
 * Sentry, the error monitor (25 November 2026), set up the same way for the
 * server, the edge and the browser (sentry.server.config, sentry.edge.config,
 * instrumentation-client).
 *
 * # Off unless configured
 *
 * Nothing is sent without `NEXT_PUBLIC_SENTRY_DSN`, and nothing from a local
 * development server either: only the Netlify builds report, labelled
 * `production` (main) or `staging` (any other branch or preview) by
 * `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, which next.config sets from Netlify's
 * CONTEXT. The DSN is public by design; it only lets a client send events.
 *
 * # What is sent, and what is not
 *
 * The admin's error table (lib/report) stays the record staff read; Sentry is
 * the second copy with stack traces, browsers and grouping. The same cleaner
 * runs on both (lib/redact): connection strings, keys, tokens, passwords and
 * email addresses are replaced before an event leaves. On top of it:
 *
 *  - no IP address, cookies or request headers (`sendDefaultPii: false`, and
 *    removed again here in case an integration adds them);
 *  - no request body or query string;
 *  - no screen recording (no Session Replay) and no performance tracing, which
 *    would also spend the free plan's quota.
 */

export const SENTRY_DSN = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim()

export const SENTRY_ENVIRONMENT =
  (process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? '').trim() || 'development'

/** True on the Netlify builds that have a DSN; false locally and in tests. */
export function sentryEnabled(
  dsn = SENTRY_DSN,
  environment = SENTRY_ENVIRONMENT,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return Boolean(dsn) && nodeEnv === 'production' && environment !== 'development'
}

/** The parts of a Sentry event that can carry text worth cleaning. */
interface ScrubbableEvent {
  message?: string
  exception?: { values?: { value?: string }[] }
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[]
  request?: {
    url?: string
    query_string?: unknown
    cookies?: unknown
    headers?: unknown
    data?: unknown
  }
  user?: unknown
  extra?: Record<string, unknown>
}

/** A URL without its query string, which can carry a reset or visit token. */
function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return redact(cut === -1 ? url : url.slice(0, cut))
}

/**
 * The event as it may leave this site: cleaned text, no personal request data.
 * Changes the event in place and returns it, as Sentry's `beforeSend` expects.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.message) event.message = redact(event.message)
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = redact(value.value)
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = redact(crumb.message)
    // Fetch and navigation breadcrumbs carry URLs; keep the path only.
    for (const key of ['url', 'from', 'to'] as const) {
      const value = crumb.data?.[key]
      if (typeof value === 'string') crumb.data![key] = withoutQuery(value)
    }
  }
  if (event.request) {
    if (event.request.url) event.request.url = withoutQuery(event.request.url)
    delete event.request.query_string
    delete event.request.cookies
    delete event.request.headers
    delete event.request.data
  }
  delete event.user
  if (event.extra) {
    for (const [key, value] of Object.entries(event.extra)) {
      if (typeof value === 'string') event.extra[key] = redact(value)
    }
  }
  return event
}

/** The settings every runtime shares. */
export function sentryOptions() {
  return {
    dsn: SENTRY_DSN || undefined,
    environment: SENTRY_ENVIRONMENT,
    enabled: sentryEnabled(),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: <T extends ScrubbableEvent>(event: T) => scrubEvent(event),
  }
}

/**
 * The origin the browser sends events to, for the Content-Security-Policy's
 * `connect-src` (lib/security-headers). Empty without a valid DSN.
 */
export function sentryIngestOrigin(dsn = SENTRY_DSN): string[] {
  if (!dsn) return []
  try {
    const url = new URL(dsn)
    return url.protocol === 'https:' ? [url.origin] : []
  } catch {
    return []
  }
}
