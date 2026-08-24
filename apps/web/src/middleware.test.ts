import { describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { clearStaleHint, config } from './middleware'
import { PAYLOAD_COOKIE } from './lib/admin-guard'
import { SESSION_HINT } from './lib/session-hint'

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

/**
 * The session hint must not outlive the session.
 *
 * The bug: `/account` rendered "Your account" in the header and "Sign in to see
 * your bookings" in the body, on the same screen. The header reads a
 * non-httpOnly hint cookie so that prerendered pages stay static; nothing
 * cleared that hint when the real token expired, so it kept asserting a session
 * that was gone.
 *
 * These assert on the Set-Cookie the middleware emits, because that is the only
 * thing the browser acts on.
 */
describe('the stale session hint', () => {
  const req = (cookies: Record<string, string>, url = 'https://vardenia.com/account') => {
    const request = new NextRequest(url)
    for (const [name, value] of Object.entries(cookies)) {
      request.cookies.set(name, value)
    }
    return request
  }

  const hintCookie = (response: NextResponse) =>
    response.cookies.getAll().find((c) => c.name === SESSION_HINT)

  it('is cleared when the hint is present but the real token is gone', () => {
    const response = clearStaleHint(req({ [SESSION_HINT]: '1' }), NextResponse.next())
    const cookie = hintCookie(response)

    expect(cookie, 'the stale hint was not cleared').toBeDefined()
    expect(cookie!.value).toBe('')
    expect(cookie!.maxAge).toBe(0)
  })

  it('is left alone when a real session backs it', () => {
    const response = clearStaleHint(
      req({ [SESSION_HINT]: '1', [PAYLOAD_COOKIE]: 'a.real.token' }),
      NextResponse.next(),
    )
    expect(hintCookie(response), 'a live session had its hint cleared').toBeUndefined()
  })

  it('does nothing when there is no hint to clear', () => {
    const response = clearStaleHint(req({}), NextResponse.next())
    expect(hintCookie(response)).toBeUndefined()
  })

  /**
   * A token with no hint is the safe direction: the header shows the signed-out
   * links, which understates the truth rather than asserting something false.
   * It must not start writing hints from middleware.
   */
  it('does not invent a hint for a session that has one missing', () => {
    const response = clearStaleHint(req({ [PAYLOAD_COOKIE]: 'a.real.token' }), NextResponse.next())
    expect(hintCookie(response)).toBeUndefined()
  })

  /** The delete has to match how the browser set it or it silently misses. */
  it('marks the deletion secure over https and not over http', () => {
    const https = clearStaleHint(req({ [SESSION_HINT]: '1' }), NextResponse.next())
    expect(hintCookie(https)!.secure).toBe(true)

    const http = clearStaleHint(
      req({ [SESSION_HINT]: '1' }, 'http://localhost:3000/account'),
      NextResponse.next(),
    )
    expect(hintCookie(http)!.secure).toBe(false)
  })
})
