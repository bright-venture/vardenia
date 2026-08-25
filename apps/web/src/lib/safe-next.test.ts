import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next'

/**
 * An open redirect on a sign-in page is worth more to an attacker than one
 * anywhere else on the site, because the page it leaves from is a real sign-in
 * form on a real domain. So the tests that matter here are the refusals.
 */

const FALLBACK = '/account'

describe('safeNextPath refuses', () => {
  /**
   * The one the old guard let through. `startsWith('/')` is true for a
   * protocol-relative URL, which is a fully external address.
   */
  it('a protocol-relative URL', () => {
    expect(safeNextPath('//evil.com', FALLBACK)).toBe(FALLBACK)
    expect(safeNextPath('//evil.com/account', FALLBACK)).toBe(FALLBACK)
  })

  /** Browsers normalise a backslash in the authority position to a slash. */
  it('a backslash standing in for the second slash', () => {
    expect(safeNextPath('/\\evil.com', FALLBACK)).toBe(FALLBACK)
    expect(safeNextPath('/\\/evil.com', FALLBACK)).toBe(FALLBACK)
  })

  it('an absolute URL', () => {
    expect(safeNextPath('https://evil.com', FALLBACK)).toBe(FALLBACK)
    expect(safeNextPath('http://evil.com', FALLBACK)).toBe(FALLBACK)
  })

  it('a scheme that is not navigation at all', () => {
    expect(safeNextPath('javascript:alert(1)', FALLBACK)).toBe(FALLBACK)
    expect(safeNextPath('data:text/html,<script>', FALLBACK)).toBe(FALLBACK)
  })

  /** A bare host is relative, and resolves against whatever page it is on. */
  it('a relative path', () => {
    expect(safeNextPath('evil.com', FALLBACK)).toBe(FALLBACK)
    expect(safeNextPath('../admin', FALLBACK)).toBe(FALLBACK)
  })

  it('nothing at all', () => {
    expect(safeNextPath(undefined, FALLBACK)).toBe(FALLBACK)
    expect(safeNextPath(null, FALLBACK)).toBe(FALLBACK)
    expect(safeNextPath('', FALLBACK)).toBe(FALLBACK)
  })

  /** Leading whitespace means it does not start with a slash. */
  it('a path hidden behind whitespace', () => {
    expect(safeNextPath(' //evil.com', FALLBACK)).toBe(FALLBACK)
  })
})

describe('safeNextPath allows', () => {
  it('an ordinary path on this site', () => {
    expect(safeNextPath('/account', FALLBACK)).toBe('/account')
    expect(safeNextPath('/directory/beit-el-nessim', FALLBACK)).toBe('/directory/beit-el-nessim')
  })

  it('a path carrying a query and a fragment', () => {
    expect(safeNextPath('/directory?governorate=beirut', FALLBACK)).toBe(
      '/directory?governorate=beirut',
    )
    expect(safeNextPath('/directory#map', FALLBACK)).toBe('/directory#map')
  })

  /** A locale prefix is an ordinary path segment and must survive. */
  it('a locale-prefixed path', () => {
    expect(safeNextPath('/ar/account', FALLBACK)).toBe('/ar/account')
  })

  /**
   * A slash somewhere in the middle is a normal path separator. Only the
   * position right after the first slash decides the host.
   */
  it('a deep path', () => {
    expect(safeNextPath('/a/b/c/d', FALLBACK)).toBe('/a/b/c/d')
  })
})
