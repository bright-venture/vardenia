import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from './i18n/routing'
import { adminRedirectFor, PAYLOAD_COOKIE } from './lib/admin-guard'
import { legacyCategoryRedirect } from './lib/legacy-urls'
import { SESSION_HINT } from './lib/session-hint'

const intl = createMiddleware(routing)

/**
 * Clear the session hint when the real session is gone.
 *
 * # The bug this fixes
 *
 * The header reads `vd_session`, a non-httpOnly cookie that says only "a session
 * exists", so it can swap its own label without the server reading the real
 * token - which would opt every prerendered page out of static rendering.
 *
 * Nothing cleared that hint when the real token expired. A reader whose session
 * had lapsed saw "Your account" in the header, clicked it, and landed on a page
 * that said "Sign in to see your bookings". Both statements on one screen, and
 * the header was the wrong one.
 *
 * The original note in lib/session-hint called this survivable on the grounds
 * that the page they land on corrects it. It does not: the header is on that
 * page too, still contradicting it, and a header that lies about who you are is
 * not a small thing on a site that takes bookings.
 *
 * # Why here
 *
 * Middleware is the only place that sees both cookies. The token is httpOnly so
 * no script can compare them, and a server component cannot write a cookie
 * during a static render. Here it costs one map lookup on a request that was
 * already going through locale routing, and it heals every page rather than
 * whichever one somebody remembered to patch.
 *
 * The reverse case needs nothing: a token with no hint shows the signed-out
 * links until the next sign-in sets it, which understates rather than lies.
 */
export function clearStaleHint(request: NextRequest, response: NextResponse): NextResponse {
  const hasHint = request.cookies.get(SESSION_HINT)?.value === '1'
  const hasToken = Boolean(request.cookies.get(PAYLOAD_COOKIE)?.value)

  if (hasHint && !hasToken) {
    response.cookies.set(SESSION_HINT, '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
      // Matches how the browser set it, or the delete silently misses.
      secure: request.nextUrl.protocol === 'https:',
    })
  }

  return response
}

/**
 * Two jobs, kept apart.
 *
 * `/admin` is Payload's and gets locale routing nowhere near it - see the
 * matcher note below. It is matched here only so that a signed-in customer can
 * be moved along before Payload renders a page they cannot leave; everything
 * else about the admin panel passes straight through.
 *
 * Every other matched path is locale routing exactly as before.
 */
export default function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const target = adminRedirectFor(request.cookies.get(PAYLOAD_COOKIE)?.value)

    if (target) {
      const url = request.nextUrl.clone()
      url.pathname = target
      url.search = ''
      return NextResponse.redirect(url)
    }

    // Staff, or nobody. Payload answers, as it always has.
    return NextResponse.next()
  }

  /**
   * `/directory?category=...` moved to the section pages. Answered here so it
   * is a real 308 - see lib/legacy-urls for why the page itself cannot do it.
   */
  const moved = legacyCategoryRedirect(request.nextUrl.pathname, request.nextUrl.searchParams)
  if (moved) {
    return NextResponse.redirect(new URL(moved, request.nextUrl), 308)
  }

  return clearStaleHint(request, intl(request) as NextResponse)
}

/**
 * Which paths this middleware sees.
 *
 * Everything matched by the *first* pattern gets locale routing - `/directory`
 * becomes `/en/directory` internally. Everything excluded from it is served
 * exactly as addressed. So that list is really the answer to one question: which
 * prefixes are *not* pages?
 *
 * `/admin` and `/api` are Payload's. `/g` is the QR redirect, and a locale
 * prefix in front of a printed short link defeats the point of it being short.
 * `/qr` serves images and the print sheet; a rewritten request there returns an
 * HTML 404 in place of an SVG, which is silent unless you check the content type
 * - the download still saves, and the broken file only surfaces in a layout
 * tool. `/reports` serves CSV and fails the same way, opening in Excel as a
 * single column of markup.
 *
 * `/booking` and `/auth` are the public JSON endpoints and were missing, which
 * meant every one of them was unreachable from the moment it was written. A POST
 * to /booking/request was rewritten to /en/booking/request, matched no route,
 * and came back as the 404 page. Nothing logged an error, because from Next's
 * point of view nothing went wrong. Verified by hand before and after that
 * change; see the note on namespaces below.
 *
 * # The second pattern, and why /admin is excluded from the first
 *
 * `/admin/:path*` is listed separately so the middleware *runs* on it while the
 * exclusion above keeps `intl` from ever touching it. Both are needed: dropping
 * the exclusion would rewrite the whole back office into the locale tree, which
 * is the outage this file has already caused once. The function above branches
 * on the path before anything else happens, so the admin panel is only ever
 * passed through or redirected, never rewritten.
 *
 * # The boundary, and why the alternation is not enough on its own
 *
 * An earlier form was `(?!api|admin|g|qr|reports|...)`, which tests a prefix and
 * not a path segment. `/g` therefore excluded every path beginning with the
 * letter g - `/guides`, `/galleries`, anything we might add - from locale
 * routing entirely, and `/media` would have taken `/mediterranean` with it. That
 * failure is quiet in exactly the way the ones above are: the page renders, in
 * the wrong language, with no error.
 *
 * `(?:/|$)` after the alternation requires the match to end at a segment
 * boundary, so `/g` and `/g/AB12CD` are excluded while `/guides` is not.
 *
 * # Namespaces
 *
 * The rule this encodes: `/account/*` is pages, `/auth/*` and `/booking/*` are
 * JSON. That is why sign-up moved from /account/signup to /auth/signup - the
 * sign-up *page* wants the readable URL, and the two cannot share a path once
 * this file stops rewriting one of them into the other.
 */
export const config = {
  matcher: [
    '/((?!(?:api|admin|auth|booking|g|qr|reports|_next|_vercel|media)(?:/|$)|.*\\.).*)',
    '/admin/:path*',
    '/admin',
  ],
}
