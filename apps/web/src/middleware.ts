import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  /**
   * Locale routing applies to the public site only.
   *
   * `/admin` and `/api` are Payload's and must be left untouched, and `/g` is
   * the QR redirect - putting a locale prefix in front of a printed short link
   * would defeat the point of it being short.
   *
   * `/qr` serves images and the print sheet. A locale prefix there produces an
   * HTML 404 in place of an SVG, which is silent unless you check the content
   * type: the download still saves, and the broken file only turns up in a
   * layout tool.
   *
   * `/reports` serves CSV downloads and has the same failure mode: a rewritten
   * request returns an HTML error page with a .csv filename attached, which
   * opens in Excel as a single column of markup.
   */
  matcher: ['/((?!api|admin|g|qr|reports|_next|_vercel|media|.*\\..*).*)'],
}
