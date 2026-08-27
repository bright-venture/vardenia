/**
 * The response headers, and the Content-Security-Policy that used to be missing.
 *
 * Lifted out of next.config.mjs so it can be tested. A policy that is wrong is
 * worse than none: it either blocks the site's own assets, which is loud, or it
 * silently permits what it was written to stop, which is not.
 *
 * # Why there are two policies
 *
 * Payload's admin panel and the public site cannot share one. The panel needs
 * `unsafe-eval`, and a policy loose enough for it would give the public pages
 * nothing worth having. So `/admin` gets its own, and the public policy is
 * written without regard for what the panel needs.
 *
 * # Why script-src still allows unsafe-inline
 *
 * The strict answer is a per-request nonce. Next supports it, and it forces
 * every page to render dynamically, because a nonce cannot be baked into a
 * cached HTML file. Static rendering here is load-bearing: a prerendered listing
 * page answers in single-digit milliseconds against roughly 350ms dynamic, and
 * the QR redirect's whole value is speed.
 *
 * So this trades the strongest anti-XSS clause for the thing the product is
 * built on, and keeps the clauses that survive without a nonce:
 *
 *   - `frame-ancestors 'none'` stops the site being framed at all, which is
 *     stricter than the X-Frame-Options header it supersedes.
 *   - `object-src 'none'` removes plugin embedding entirely.
 *   - `base-uri 'self'` stops an injected `<base>` re-pointing every relative
 *     URL on the page, which is how an inline-script bypass usually escalates.
 *   - `form-action 'self'` stops a form being posted to somebody else's server.
 *   - `default-src 'self'` and an explicit `connect-src` mean an injected script
 *     still cannot reach an origin we have not named, so stolen data has nowhere
 *     to go.
 *
 * That is a real reduction in what an XSS can accomplish, without pretending it
 * prevents one. There is exactly one `dangerouslySetInnerHTML` in the codebase
 * and it escapes `<`; see components/JsonLd.
 */

/** The analytics origin, when one is configured. Empty otherwise. */
function analyticsOrigin(src: string | undefined): string[] {
  if (!src) return []
  try {
    return [new URL(src).origin]
  } catch {
    // A malformed value must not widen the policy to nothing, and must not throw
    // during a build. Analytics simply stays blocked until the value is a URL.
    return []
  }
}

function policy(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(' ')}` : name))
    .join('; ')
}

/**
 * `next dev` compiles modules through React Refresh, which evaluates strings.
 * Without this the dev server throws `EvalError: Evaluating a string as
 * JavaScript violates the following Content Security Policy directive` out of
 * main-app.js on every page load, and hot reload stops working - while the
 * production build, which does not use eval, is completely unaffected.
 *
 * So the exception is granted to the development build only. Getting this
 * backwards is how a policy ends up loosened in production because it was
 * annoying locally.
 */
const devEval = (isProduction = process.env.NODE_ENV === 'production'): string[] =>
  isProduction ? [] : ["'unsafe-eval'"]

export function publicCsp(
  analyticsSrc = process.env.NEXT_PUBLIC_ANALYTICS_SRC,
  isProduction = process.env.NODE_ENV === 'production',
): string {
  const analytics = analyticsOrigin(analyticsSrc)

  return policy({
    'default-src': ["'self'"],
    // See the note above on why this is not a nonce.
    'script-src': ["'self'", "'unsafe-inline'", ...devEval(isProduction), ...analytics],
    // Tailwind ships a stylesheet, but Next inlines critical CSS and React
    // injects style attributes, so this cannot be 'self' alone.
    'style-src': ["'self'", "'unsafe-inline'"],
    // Uploads are served from Supabase storage, and next/image emits data: and
    // blob: URLs for placeholders. The remotePatterns list in next.config is the
    // narrower control on which hosts an image may actually come from.
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    // Where a script may send data. Named explicitly, because this is what turns
    // a successful injection into a failed exfiltration.
    'connect-src': ["'self'", ...analytics],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'upgrade-insecure-requests': [],
  })
}

/**
 * The admin panel's policy.
 *
 * Weaker on scripts and deliberately so: Payload's panel does not run under the
 * public policy. Everything that does not depend on how the panel builds its UI
 * is kept, so this is still meaningfully narrower than no header at all - the
 * panel cannot be framed, cannot post a form off-origin, and cannot load a
 * plugin object.
 */
export function adminCsp(): string {
  return policy({
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  })
}

/**
 * Everything that is not the policy.
 *
 * `X-Frame-Options` stays alongside `frame-ancestors` even though the latter
 * supersedes it, because it is the one an old browser understands.
 */
export const BASE_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

/**
 * What next.config exports from `headers()`.
 *
 * Two entries, and the order matters less than the fact that their sources do
 * not overlap: the public one excludes `/admin` with a negative lookahead, so no
 * path can be served two Content-Security-Policy headers. A page that receives
 * two gets the intersection of both, which here would mean the admin panel
 * silently inheriting the public policy's script rules and breaking.
 */
export function securityHeaders() {
  return [
    {
      source: '/((?!admin(?:/|$)).*)',
      headers: [...BASE_HEADERS, { key: 'Content-Security-Policy', value: publicCsp() }],
    },
    {
      source: '/admin/:path*',
      headers: [...BASE_HEADERS, { key: 'Content-Security-Policy', value: adminCsp() }],
    },
    {
      source: '/admin',
      headers: [...BASE_HEADERS, { key: 'Content-Security-Policy', value: adminCsp() }],
    },
  ]
}
