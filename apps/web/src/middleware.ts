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
   */
  matcher: ['/((?!api|admin|g|_next|_vercel|media|.*\\..*).*)'],
}
