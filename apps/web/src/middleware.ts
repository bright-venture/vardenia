import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

/**
 * Which paths get locale routing.
 *
 * Everything matched here is rewritten into the locale tree - `/directory`
 * becomes `/en/directory` internally. Everything excluded is served exactly as
 * addressed. So this list is really the answer to one question: which prefixes
 * are *not* pages?
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
 * point of view nothing went wrong. Verified by hand before and after this
 * change; see the note on namespaces below.
 *
 * # The boundary, and why the alternation is not enough on its own
 *
 * The previous form was `(?!api|admin|g|qr|reports|...)`, which tests a prefix
 * and not a path segment. `/g` therefore excluded every path beginning with the
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
  matcher: ['/((?!(?:api|admin|auth|booking|g|qr|reports|_next|_vercel|media)(?:/|$)|.*\\.).*)'],
}
