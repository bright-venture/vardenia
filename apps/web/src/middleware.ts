import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from './i18n/routing'
import { adminRedirectFor, PAYLOAD_COOKIE, tokenCollection } from './lib/admin-guard'
import { legacyCategoryRedirect } from './lib/legacy-urls'
import { isUnknownTopLevelPath } from './lib/known-paths'
import { HINT_VALUE, SESSION_HINT } from './lib/session-hint'

const intl = createMiddleware(routing)

/**
 * What the hint should say for this token, or null for no hint at all.
 *
 * The collection claim is what makes this correct. Payload issues one cookie
 * name for every auth collection, so the mere presence of `payload-token` says
 * nothing about who is holding it - which is how signing in to the admin panel
 * as staff ended up lighting up "Your account" in the public header.
 *
 * Staff get null on purpose. They are not customers and the account page has
 * nothing for them; the admin panel is where they belong, and the header
 * offering a way in is the honest answer for the site they are looking at.
 *
 * An unrecognised collection also gets null. A new auth collection added later
 * should not inherit a customer's header by default - understating is the safe
 * failure, and this is a label rather than a permission.
 *
 * Reading the claim without verifying the signature is fine here for the same
 * reason it is fine in admin-guard: nothing is granted on the strength of it.
 * A forged token changes one word in its own author's header.
 */
function hintFor(token: string | undefined): string | null {
  switch (tokenCollection(token)) {
    case 'customers':
      return HINT_VALUE.customer
    case 'business-users':
      return HINT_VALUE.partner
    default:
      return null
  }
}

/**
 * Keep the session hint agreeing with the real session, in both directions.
 *
 * # What the hint is for
 *
 * The header reads `vd_session`, a non-httpOnly cookie naming which kind of
 * session exists and nothing else, so it can swap its own label without the
 * server reading the real token - which would opt every prerendered page out of
 * static rendering.
 *
 * # Both directions are bugs, and both were seen
 *
 * Nothing cleared the hint when the token expired, so a lapsed reader saw "Your
 * account" in the header and "Sign in to see your bookings" in the page body,
 * on the same screen.
 *
 * The first version of this fixed only that direction, on the reasoning that a
 * token with no hint "understates rather than lies". That was wrong in
 * practice. Nothing ever *sets* the hint except a fresh login, so any session
 * whose hint is lost - a partial cookie clear, a privacy tool, a console
 * command - shows Sign in and Sign up to somebody who is signed in, on a page
 * that is simultaneously showing them their bookings and a Sign out button.
 * A header that contradicts the page it sits on reads as broken whichever way
 * round it is.
 *
 * So the hint is now written as well as cleared. It carries no identity and
 * authorises nothing; the httpOnly token remains the only thing any real check
 * consults.
 *
 * # Why here
 *
 * Middleware is the only place that sees both cookies. The token is httpOnly so
 * no script can compare them, and a server component cannot write a cookie
 * during a static render. It costs two map lookups on a request that was
 * already going through locale routing, and it heals every page rather than
 * whichever one somebody remembered to patch.
 */
export function syncSessionHint(request: NextRequest, response: NextResponse): NextResponse {
  const current = request.cookies.get(SESSION_HINT)?.value ?? ''
  const wanted = hintFor(request.cookies.get(PAYLOAD_COOKIE)?.value)

  if (current === (wanted ?? '')) return response

  /**
   * Whether the browser will accept a `Secure` cookie.
   *
   * `nextUrl.protocol` is the wrong thing to ask behind a proxy: Netlify
   * terminates TLS at the edge and forwards internally over http, so it reads
   * `http:` on a request the reader made over https. Setting the cookie
   * non-secure then leaves a Secure original untouched, and the two disagree.
   *
   * `x-forwarded-proto` is what the edge actually saw. Falling back to the URL
   * keeps local http development working, where no such header exists.
   */
  const forwarded = request.headers.get('x-forwarded-proto')
  const secure = forwarded
    ? forwarded.split(',')[0]?.trim() === 'https'
    : request.nextUrl.protocol === 'https:'

  // A week, matching the token's own lifetime, so the two lapse together.
  const shared = { path: '/', sameSite: 'lax', secure } as const

  if (wanted) {
    response.cookies.set(SESSION_HINT, wanted, { ...shared, maxAge: 60 * 60 * 24 * 7 })
  } else {
    response.cookies.set(SESSION_HINT, '', { ...shared, maxAge: 0 })
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

  const response = syncSessionHint(request, intl(request) as NextResponse)

  /**
   * A single-segment path nothing serves gets a real 404 status.
   *
   * `notFound()` renders the right page and returns 200 in this application -
   * measured, and not caused by the rewrite, since an unrewritten `/ar/nonsense`
   * behaves the same. A crawler reads the status line, so without this every
   * invented URL a scanner probes is an indexable page.
   *
   * Re-issued rather than mutated: a NextResponse's status is fixed once built,
   * so this constructs the same rewrite again with a status attached and copies
   * the cookies syncSessionHint just set. See lib/known-paths for what it can
   * and cannot decide.
   */
  if (isUnknownTopLevelPath(request.nextUrl.pathname, routing.locales)) {
    const destination = response.headers.get('x-middleware-rewrite')
    const url = destination ? new URL(destination, request.url) : request.nextUrl.clone()

    const notFoundResponse = NextResponse.rewrite(url, { status: 404 })
    for (const cookie of response.cookies.getAll()) {
      notFoundResponse.cookies.set(cookie)
    }
    return notFoundResponse
  }

  return response
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
