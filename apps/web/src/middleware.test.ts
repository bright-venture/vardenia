import { describe, expect, it } from 'vitest'
import { config } from './middleware'

/**
 * Which paths get locale routing, asserted rather than reasoned about.
 *
 * This regex decides whether a request is a page or a JSON endpoint, and both
 * ways of getting it wrong are silent. A page wrongly excluded renders in the
 * default language with no error. An endpoint wrongly included is rewritten into
 * the locale tree, matches nothing, and comes back as the 404 page - which is
 * exactly what had happened to every booking and account endpoint: they were
 * written, tested by unit test, deployed, and had never once been reachable over
 * HTTP.
 *
 * Nothing in a type checker or a test suite catches that. A list of paths does.
 */

const matcher = new RegExp(`^${config.matcher[0]}$`)
const routed = (path: string) => matcher.test(path)

describe('locale routing applies to', () => {
  it.each([
    '/',
    '/directory',
    '/directory/le-royal-hotel',
    '/magazine',
    '/magazine/issues/spring-2026',
    '/account',
    '/account/login',
    '/account/signup',
    '/scan/moved',
  ])('%s', (path) => {
    expect(routed(path)).toBe(true)
  })
})

describe('locale routing leaves alone', () => {
  it.each([
    ['/api/businesses', 'Payload owns /api'],
    ['/admin', "Payload's admin panel"],
    ['/admin/collections/businesses', 'and everything under it'],
    ['/auth/signup', 'JSON, and the reason sign-up moved off /account'],
    ['/booking/request', 'JSON: rewritten, this returned the 404 page'],
    ['/booking/availability', 'the same'],
    ['/g/AB12CD3', 'a printed short link must stay short'],
    ['/qr/AB12CD3', 'serves an SVG; a rewrite returns HTML with an .svg name'],
    ['/qr/sheet', 'the print sheet'],
    ['/reports/scans', 'a CSV that would open in Excel as a column of markup'],
    ['/_next/static/chunk.js', 'build output'],
    ['/media/hero.jpg', 'uploads'],
    ['/favicon.ico', 'anything with a dot is a file'],
    ['/sitemap.xml', 'the same'],
  ])('%s - %s', (path) => {
    expect(routed(path)).toBe(false)
  })
})

/**
 * The exclusions are path segments, not prefixes.
 *
 * The previous form tested `(?!api|admin|g|qr|...)`, which matches a prefix. `g`
 * therefore excluded every path beginning with the letter g from locale routing
 * - so a future /guides would have rendered in English for an Arabic reader,
 * with nothing to indicate why. These are the paths that regex got wrong.
 */
describe('a prefix is not a segment', () => {
  it.each([
    '/guides',
    '/galleries',
    '/bookings',
    '/apiary',
    '/administrators',
    '/mediterranean',
    '/reportage',
    '/qrcodes',
    '/authors',
  ])('%s is a page, not an excluded prefix', (path) => {
    expect(routed(path)).toBe(true)
  })
})
