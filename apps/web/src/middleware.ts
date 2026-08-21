import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from './i18n/routing'
import { adminRedirectFor, PAYLOAD_COOKIE } from './lib/admin-guard'

const intl = createMiddleware(routing)

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

  return intl(request) as NextResponse
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
